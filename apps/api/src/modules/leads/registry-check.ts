import type { RegistryCheckResult, RegistryStatus } from "@gac/shared";
import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { companies, leadEvents, leads } from "../../db/schema";
import { classifyRegistry, httpRegistryFetcher, type RegistryFetcher } from "../../enrich/registry";
import { notFound } from "../../lib/errors";

/** Une entreprise en activité est recontrôlée chaque mois : une fermeture peut survenir à tout moment. */
const VALIDITY_DAYS = 30;
/** L'API publique tolère environ 7 appels par seconde : on reste très en dessous. */
const CONCURRENCY = 2;

/** Entreprises à contrôler : françaises, pas tranchées par une personne, pas déjà fermées, contrôle absent ou périmé. */
const dueCondition = () =>
  and(
    eq(companies.country, "FR"),
    eq(companies.registryManual, false),
    or(isNull(companies.registryStatus), ne(companies.registryStatus, "closed")),
    or(
      isNull(companies.registryCheckedAt),
      lt(companies.registryCheckedAt, sql`now() - interval '${sql.raw(String(VALIDITY_DAYS))} days'`),
    ),
  );

export async function countDue(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(companies).where(dueCondition());
  return row?.n ?? 0;
}

async function mapLimited<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i] as T);
      }
    }),
  );
}

/**
 * Contrôle jusqu'à `limit` entreprises auprès du registre officiel. Rien n'est supprimé : une fermeture marque
 * l'entreprise (section « Entreprises fermées » du CRM), avec trace dans l'historique de ses leads.
 */
export async function runRegistryCheck(
  db: Db,
  opts: { limit: number; actorId: string; fetcher?: RegistryFetcher },
): Promise<RegistryCheckResult> {
  const fetcher = opts.fetcher ?? httpRegistryFetcher;
  const due = await db
    .select({
      id: companies.id,
      name: companies.name,
      city: companies.city,
      previous: companies.registryStatus,
    })
    .from(companies)
    .where(dueCondition())
    .orderBy(companies.createdAt, companies.id)
    .limit(opts.limit);

  const result: RegistryCheckResult = {
    checked: 0,
    active: 0,
    closed: 0,
    toConfirm: 0,
    notFound: 0,
    failed: 0,
    remaining: 0,
  };

  await mapLimited(due, CONCURRENCY, async (c) => {
    let outcome: ReturnType<typeof classifyRegistry>;
    try {
      outcome = classifyRegistry(c, await fetcher(c.name));
    } catch {
      result.failed += 1; // reste à contrôler au prochain appel
      return;
    }
    result.checked += 1;
    const status: RegistryStatus | null = outcome.status === "not_found" ? null : outcome.status;
    if (outcome.status === "not_found") result.notFound += 1;
    else if (outcome.status === "active") result.active += 1;
    else if (outcome.status === "closed") result.closed += 1;
    else result.toConfirm += 1;

    const siren = outcome.status === "not_found" ? null : outcome.siren;
    const closedOn = outcome.status === "closed" || outcome.status === "to_confirm" ? outcome.closedOn : null;
    await db.transaction(async (tx) => {
      await tx
        .update(companies)
        .set({
          registryStatus: status,
          registrySiren: siren,
          registryClosedOn: closedOn,
          registryCheckedAt: new Date(),
        })
        .where(and(eq(companies.id, c.id), eq(companies.registryManual, false)));
      if ((status === "closed" || status === "to_confirm") && status !== c.previous) {
        const rows = await tx.select({ id: leads.id }).from(leads).where(eq(leads.companyId, c.id));
        if (rows.length) {
          await tx.insert(leadEvents).values(
            rows.map((l) => ({
              leadId: l.id,
              actorId: opts.actorId,
              type: "company_registry",
              data: { status, siren, closedOn },
            })),
          );
        }
      }
    });
  });

  result.remaining = await countDue(db);
  return result;
}

/**
 * Décision d'une personne sur la situation d'une entreprise : `confirm` = fermée, `dismiss` = toujours en activité
 * (homonyme, ancienne entité…). Les contrôles automatiques ne modifient plus ensuite cette entreprise.
 */
export async function decideRegistry(
  db: Db,
  leadId: string,
  decision: "confirm" | "dismiss",
  actorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [lead] = await tx
      .select({ companyId: leads.companyId })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    if (!lead) throw notFound("Lead introuvable");
    const status: RegistryStatus = decision === "confirm" ? "closed" : "active";
    await tx
      .update(companies)
      .set({ registryStatus: status, registryManual: true, registryCheckedAt: new Date() })
      .where(eq(companies.id, lead.companyId));
    const rows = await tx.select({ id: leads.id }).from(leads).where(eq(leads.companyId, lead.companyId));
    await tx.insert(leadEvents).values(
      rows.map((l) => ({
        leadId: l.id,
        actorId,
        type: "company_registry",
        data: { status, decision, manual: true },
      })),
    );
  });
}
