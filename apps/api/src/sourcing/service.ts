import type { SourcingCriteria, SourcingEstimate } from "@gac/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AiClient } from "../ai/anthropic";
import { type AiDeps, scoreLead } from "../ai/service";
import type { Config } from "../config";
import type { Db } from "../db/client";
import { companies, sourcingRuns } from "../db/schema";
import type { SiteFetcher } from "../enrich/safe-fetch";
import { normalizePhone } from "../import/normalize";
import { createLead } from "../lib/create-lead";
import { AppError } from "../lib/errors";
import type { FoundProspect, SourcingProvider } from "./provider";

/** Une recherche qui n'a pas fini après ce délai est abandonnée (le fournisseur est arrêté, le coût déjà engagé reste compté). */
export const RUN_TIMEOUT_MS = 45 * 60_000;

export function estimateCost(config: Config, maxResults: number): number {
  return Math.round(maxResults * config.SOURCING_COST_PER_RESULT * 100) / 100;
}

/** Coût estimé engagé aujourd'hui (jour de Paris) : les recherches annulées n'y comptent pas. */
export async function spentToday(db: Db, now = new Date()): Promise<number> {
  const [row] = await db
    .select({
      n: sql<number>`coalesce(sum(coalesce(${sourcingRuns.cost}, ${sourcingRuns.estimatedCost})), 0)::float8`,
    })
    .from(sourcingRuns)
    .where(
      and(
        sql`(${sourcingRuns.createdAt} at time zone 'Europe/Paris')::date = (${now.toISOString()}::timestamptz at time zone 'Europe/Paris')::date`,
        sql`${sourcingRuns.state} <> 'cancelled'`,
        // une recherche refusée avant de démarrer chez le fournisseur n'a rien coûté
        sql`not (${sourcingRuns.state} = 'failed' and ${sourcingRuns.providerRunId} is null)`,
      ),
    );
  return Math.round((row?.n ?? 0) * 100) / 100;
}

/** Simulation : coût maximal et ordre de grandeur des doublons (entreprises déjà connues dans ces villes et ce secteur). */
export async function simulate(db: Db, config: Config, c: SourcingCriteria): Promise<SourcingEstimate> {
  if (c.maxResults > config.SOURCING_MAX_PER_RUN) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Une recherche est limitée à ${config.SOURCING_MAX_PER_RUN} résultats (SOURCING_MAX_PER_RUN)`,
    );
  }
  const likeCity = c.cities.map((v) => sql`lower(${companies.city}) = ${v.toLowerCase()}`);
  const [dup] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(companies)
    .where(
      and(
        sql`(${sql.join(likeCity, sql` or `)})`,
        sql`(${companies.sector} ilike ${`%${c.query.replace(/[%_\\]/g, "\\$&")}%`} or ${companies.googleCategory} ilike ${`%${c.query.replace(/[%_\\]/g, "\\$&")}%`})`,
      ),
    );
  return {
    dryRun: true,
    estimatedCost: estimateCost(config, c.maxResults),
    maxResults: c.maxResults,
    probableDuplicates: dup?.n ?? 0,
    spentToday: await spentToday(db),
    dailyBudget: config.SOURCING_DAILY_BUDGET,
  };
}

/** Ajoute les prospects trouvés : France seulement, jamais de doublon. Renvoie le décompte. */
export async function ingest(
  db: Db,
  runId: string,
  criteria: SourcingCriteria,
  items: FoundProspect[],
  actorId: string | null,
): Promise<{ created: number; duplicates: number; rejected: number; createdIds: string[] }> {
  const createdIds: string[] = [];
  let created = 0;
  let duplicates = 0;
  let rejected = 0;
  for (const it of items) {
    const phone = normalizePhone(it.phone);
    // règle de l'ancienne chaîne : seuls les numéros français sont gardés
    if (!phone?.startsWith("+33")) {
      rejected++;
      continue;
    }
    if (criteria.source === "google_maps" && criteria.noWebsiteOnly && it.website) {
      rejected++;
      continue;
    }
    try {
      const leadId = await createLead(
        db,
        {
          companyName: it.companyName,
          ...(it.website ? { website: it.website } : {}),
          phone,
          ...(it.city ? { city: it.city } : {}),
          ...(it.sector ? { sector: it.sector } : {}),
          ...(it.firstName ? { firstName: it.firstName } : {}),
          ...(it.lastName ? { lastName: it.lastName } : {}),
          ...(it.jobTitle ? { jobTitle: it.jobTitle } : {}),
          ...(it.email ? { email: it.email } : {}),
          address: it.address ?? null,
          postalCode: it.postalCode ?? null,
          employees: it.employees ?? null,
          googleCategory: it.googleCategory ?? null,
          googleRating: it.googleRating ?? null,
          googleReviews: it.googleReviews ?? null,
          googleMapsUrl: it.googleMapsUrl ?? null,
          linkedinUrl: it.linkedinUrl ?? null,
        },
        {
          actorId,
          source: criteria.source === "google_maps" ? "Sourcing · Google Maps" : "Sourcing · LinkedIn",
          eventData: { sourcingRunId: runId },
        },
      );
      created++;
      createdIds.push(leadId);
    } catch (e) {
      if (e instanceof AppError && e.statusCode === 409) duplicates++;
      else if (e instanceof AppError && e.statusCode === 400) rejected++;
      else throw e;
    }
  }
  return { created, duplicates, rejected, createdIds };
}

export interface SourcingDeps {
  db: Db;
  config: Config;
  provider: SourcingProvider | null;
  /** Si présent (et `SCORING_AUTO`), les prospects trouvés sont qualifiés et leur e-mail rédigé aussitôt. */
  ai?: AiClient | null;
  fetchSite?: SiteFetcher | null;
  now?: () => Date;
}

/**
 * Un cycle : lance les recherches en attente, interroge celles en cours. Chaque transition est atomique (`update … where
 * state = …`), donc deux cycles simultanés ne lancent jamais deux fois la même recherche.
 */
export async function sourcingTick({
  db,
  config,
  provider,
  ai = null,
  fetchSite = null,
  now = () => new Date(),
}: SourcingDeps): Promise<{ changed: number }> {
  if (!provider) return { changed: 0 };
  let changed = 0;

  const queued = await db.select().from(sourcingRuns).where(eq(sourcingRuns.state, "queued")).limit(5);
  for (const run of queued) {
    const [claimed] = await db
      .update(sourcingRuns)
      .set({ state: "running", startedAt: now() })
      .where(and(eq(sourcingRuns.id, run.id), eq(sourcingRuns.state, "queued")))
      .returning({ id: sourcingRuns.id });
    if (!claimed) continue;
    changed++;
    try {
      const { providerRunId } = await provider.start(run.criteria as unknown as SourcingCriteria);
      await db.update(sourcingRuns).set({ providerRunId }).where(eq(sourcingRuns.id, run.id));
    } catch (e) {
      await db
        .update(sourcingRuns)
        .set({ state: "failed", error: describeError(e), finishedAt: now() })
        .where(eq(sourcingRuns.id, run.id));
    }
  }

  const running = await db.select().from(sourcingRuns).where(eq(sourcingRuns.state, "running")).limit(10);
  for (const run of running) {
    if (!run.providerRunId) {
      // démarrage interrompu avant de connaître l'identifiant fournisseur : on ne relance pas (coût), on abandonne
      if (run.startedAt && now().getTime() - run.startedAt.getTime() > 5 * 60_000) {
        await finish(db, run.id, "failed", { error: "Démarrage interrompu : relancez la recherche" }, now());
        changed++;
      }
      continue;
    }
    if (run.startedAt && now().getTime() - run.startedAt.getTime() > RUN_TIMEOUT_MS) {
      await provider.abort(run.providerRunId).catch(() => undefined);
      await finish(db, run.id, "failed", { error: "Délai dépassé : la recherche a été arrêtée" }, now());
      changed++;
      continue;
    }
    try {
      const res = await provider.poll(run.providerRunId);
      if (res.state === "running") {
        if (res.progress !== undefined && res.progress !== run.progress) {
          await db
            .update(sourcingRuns)
            .set({ progress: Math.round(res.progress) })
            .where(eq(sourcingRuns.id, run.id));
        }
      } else if (res.state === "failed") {
        await finish(db, run.id, "failed", { error: res.error.slice(0, 300) }, now());
        changed++;
      } else {
        const { createdIds, ...counts } = await ingest(
          db,
          run.id,
          run.criteria as unknown as SourcingCriteria,
          res.items,
          run.createdBy,
        );
        await finish(
          db,
          run.id,
          "succeeded",
          {
            found: res.items.length,
            ...counts,
            ...(res.cost !== undefined ? { cost: res.cost } : {}),
            progress: 100,
          },
          now(),
        );
        changed++;
        if (ai && config.SCORING_AUTO)
          await scoreMany({ db, config, ai, fetchSite }, createdIds, run.createdBy);
      }
    } catch (e) {
      // erreur de lecture passagère : on réessaie au prochain cycle ; le délai maximal borne l'attente
      void e;
    }
  }
  return { changed };
}

/** Termine une recherche une seule fois (un cycle concurrent ne la termine pas deux fois). */
async function finish(
  db: Db,
  id: string,
  state: "succeeded" | "failed" | "cancelled",
  values: Partial<typeof sourcingRuns.$inferInsert>,
  at: Date,
): Promise<void> {
  await db
    .update(sourcingRuns)
    .set({ ...values, state, finishedAt: at })
    .where(and(eq(sourcingRuns.id, id), inArray(sourcingRuns.state, ["queued", "running"])));
}

export { finish as finishRun };

function describeError(e: unknown): string {
  return (e instanceof Error ? e.message : "Erreur inconnue").slice(0, 300);
}

/** Qualifie les nouveaux prospects, trois à la fois. Une erreur sur un lead (quota, réponse invalide) n'arrête pas les autres. */
export async function scoreMany(
  deps: AiDeps,
  ids: string[],
  actorId: string | null,
): Promise<{ scored: number; failed: number }> {
  let scored = 0;
  let failed = 0;
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        await scoreLead(deps, id, actorId);
        scored++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { scored, failed };
}
