import {
  createSourcingRunSchema,
  type SourcingCriteria,
  type SourcingRun,
  sourcingEstimateSchema,
  sourcingListQuerySchema,
  sourcingRunPageSchema,
  sourcingRunSchema,
  sourcingStatusSchema,
} from "@gac/shared";
import { desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { sourcingRuns, users } from "../db/schema";
import { authOf } from "../lib/assert";
import { audit } from "../lib/audit";
import { AppError, conflict } from "../lib/errors";
import { estimateCost, finishRun, simulate, spentToday } from "./service";

type Row = typeof sourcingRuns.$inferSelect & { creatorName: string | null };

const toRun = (r: Row): SourcingRun => ({
  id: r.id,
  criteria: r.criteria as unknown as SourcingCriteria,
  state: r.state as SourcingRun["state"],
  estimatedCost: r.estimatedCost,
  cost: r.cost,
  progress: r.progress,
  found: r.found,
  created: r.created,
  duplicates: r.duplicates,
  rejected: r.rejected,
  error: r.error,
  createdAt: r.createdAt.toISOString(),
  startedAt: r.startedAt?.toISOString() ?? null,
  finishedAt: r.finishedAt?.toISOString() ?? null,
  createdBy: r.createdBy && r.creatorName ? { id: r.createdBy, name: r.creatorName } : null,
});

/** Sourcing : simuler (coût, doublons probables), lancer, suivre, annuler. Réservé aux responsables. */
export async function sourcingRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const manager = app.requireRole("MANAGER");

  const select = () =>
    db
      .select({ run: sourcingRuns, creatorName: users.name })
      .from(sourcingRuns)
      .leftJoin(users, eq(users.id, sourcingRuns.createdBy));
  const one = async (id: string): Promise<SourcingRun> => {
    const [row] = await select().where(eq(sourcingRuns.id, id)).limit(1);
    if (!row) throw new AppError(404, "NOT_FOUND", "Recherche introuvable");
    return toRun({ ...row.run, creatorName: row.creatorName });
  };

  r.get(
    "/sourcing/status",
    { preHandler: manager, schema: { response: { 200: sourcingStatusSchema } } },
    async () => ({
      mode: config.SOURCING_MODE,
      configured: config.SOURCING_MODE === "off" ? true : !!app.sourcingProvider,
      costPerResult: config.SOURCING_COST_PER_RESULT,
      dailyBudget: config.SOURCING_DAILY_BUDGET,
      spentToday: await spentToday(db),
      maxPerRun: config.SOURCING_MAX_PER_RUN,
    }),
  );

  r.get(
    "/sourcing/runs",
    {
      preHandler: manager,
      schema: { querystring: sourcingListQuerySchema, response: { 200: sourcingRunPageSchema } },
    },
    async (req) => {
      const [rows, [total]] = await Promise.all([
        select().orderBy(desc(sourcingRuns.createdAt)).limit(req.query.limit).offset(req.query.offset),
        db.select({ n: sql<number>`count(*)::int` }).from(sourcingRuns),
      ]);
      return {
        items: rows.map((x) => toRun({ ...x.run, creatorName: x.creatorName })),
        total: total?.n ?? 0,
      };
    },
  );

  /** Simule (`dryRun`) ou lance. Le lancement exige le coût vu en simulation : si le tarif ou le plafond a changé, 409. */
  r.post(
    "/sourcing/runs",
    {
      preHandler: manager,
      schema: {
        body: createSourcingRunSchema,
        response: { 200: sourcingEstimateSchema, 201: sourcingRunSchema },
      },
      config: { rateLimit: { max: config.LOGIN_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const { criteria, dryRun, expectedCost } = req.body;
      const estimate = await simulate(db, config, criteria);
      if (dryRun) return estimate;

      if (config.SOURCING_MODE === "off") {
        throw conflict("Le sourcing est désactivé sur ce serveur (SOURCING_MODE=off)");
      }
      if (!app.sourcingProvider)
        throw conflict("Le fournisseur de prospects n'est pas configuré (jeton manquant)");
      if (expectedCost === undefined || Math.abs(expectedCost - estimate.estimatedCost) > 0.005) {
        throw conflict("Le coût a changé depuis la simulation : simulez de nouveau avant de lancer");
      }
      if (estimate.spentToday + estimate.estimatedCost > config.SOURCING_DAILY_BUDGET + 1e-9) {
        throw conflict(
          `Plafond du jour atteint : ${estimate.spentToday.toFixed(2)} € déjà engagés sur ${config.SOURCING_DAILY_BUDGET.toFixed(2)} €`,
        );
      }
      const actor = authOf(req).user;
      const [row] = await db
        .insert(sourcingRuns)
        .values({
          createdBy: actor.id,
          criteria: criteria as unknown as Record<string, unknown>,
          estimatedCost: estimateCost(config, criteria.maxResults),
        })
        .returning({ id: sourcingRuns.id });
      if (!row) throw new AppError(500, "INTERNAL_ERROR", "Création impossible");
      await audit(db, {
        actorId: actor.id,
        action: "sourcing.started",
        entityType: "sourcing_run",
        entityId: row.id,
        ip: req.ip,
        data: {
          source: criteria.source,
          maxResults: criteria.maxResults,
          estimatedCost: estimate.estimatedCost,
        },
      });
      return reply.code(201).send(await one(row.id));
    },
  );

  r.post(
    "/sourcing/runs/:id/cancel",
    {
      preHandler: manager,
      schema: { params: z.object({ id: z.uuid() }), response: { 200: sourcingRunSchema } },
    },
    async (req) => {
      const run = await one(req.params.id);
      if (run.state !== "queued" && run.state !== "running") {
        throw conflict("Cette recherche est déjà terminée");
      }
      const [raw] = await db.select().from(sourcingRuns).where(eq(sourcingRuns.id, run.id)).limit(1);
      if (raw?.providerRunId && app.sourcingProvider) {
        await app.sourcingProvider.abort(raw.providerRunId).catch(() => undefined);
      }
      await finishRun(db, run.id, "cancelled", {}, new Date());
      await audit(db, {
        actorId: authOf(req).user.id,
        action: "sourcing.cancelled",
        entityType: "sourcing_run",
        entityId: run.id,
        ip: req.ip,
      });
      return one(run.id);
    },
  );
}
