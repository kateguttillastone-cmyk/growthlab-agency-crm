import {
  type LeadSummary,
  NONE,
  PIPELINE_STAGES,
  type PipelineBoard,
  pipelineBoardSchema,
  pipelineMoreQuerySchema,
  pipelineMoreSchema,
  pipelineQuerySchema,
  userOptionSchema,
} from "@gac/shared";
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { companies, contacts, leads, users } from "../../db/schema";
import { toSummary } from "./dto";
import { likePattern } from "./queries";
import { leadReader } from "./read";

type Filters = { qualification?: string | undefined; owner?: string | undefined; q?: string | undefined };

/** Critères communs aux colonnes du tableau (qualification, responsable, recherche). */
function boardFilters(f: Filters): SQL[] {
  const where: SQL[] = [];
  if (f.qualification) {
    where.push(
      f.qualification === NONE
        ? isNull(leads.qualification)
        : eq(leads.qualification, f.qualification as never),
    );
  }
  if (f.owner) where.push(f.owner === NONE ? isNull(leads.ownerId) : eq(leads.ownerId, f.owner));
  if (f.q) {
    const pattern = likePattern(f.q);
    where.push(
      sql`(${ilike(companies.name, pattern)} or ${ilike(companies.domain, pattern)} or ${ilike(contacts.email, pattern)})`,
    );
  }
  return where;
}

/** Tableau du pipeline (Kanban) et listes d'options : seules les lectures ; les déplacements passent par `PATCH /leads/:id`. */
export async function pipelineRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const viewer = app.requireRole("VIEWER");
  const { joined } = leadReader(db);

  // Colonnes : un comptage groupé, puis les cartes les plus récemment modifiées de chaque étape.
  r.get(
    "/pipeline",
    {
      preHandler: viewer,
      schema: { querystring: pipelineQuerySchema, response: { 200: pipelineBoardSchema } },
    },
    async (req): Promise<PipelineBoard> => {
      const { perStage, ...filters } = req.query;
      const base = boardFilters(filters);
      const [totals, [unstaged]] = await Promise.all([
        db
          .select({
            stage: leads.stage,
            n: count(),
            value: sql<number>`coalesce(sum(${leads.dealValue}), 0)::float8`,
          })
          .from(leads)
          .innerJoin(companies, eq(companies.id, leads.companyId))
          .leftJoin(contacts, eq(contacts.id, leads.contactId))
          .where(and(isNotNull(leads.stage), ...base))
          .groupBy(leads.stage),
        db
          .select({ n: count() })
          .from(leads)
          .innerJoin(companies, eq(companies.id, leads.companyId))
          .leftJoin(contacts, eq(contacts.id, leads.contactId))
          .where(and(isNull(leads.stage), ...base)),
      ]);
      const stages = await Promise.all(
        PIPELINE_STAGES.map(async (stage) => {
          const total = totals.find((t) => t.stage === stage);
          const rows = total
            ? await joined()
                .where(and(eq(leads.stage, stage), ...base))
                .orderBy(desc(leads.updatedAt), asc(leads.id))
                .limit(perStage)
            : [];
          return {
            stage,
            count: total?.n ?? 0,
            value: Number(total?.value ?? 0),
            items: rows.map(toSummary) as LeadSummary[],
          };
        }),
      );
      return { stages, unstaged: unstaged?.n ?? 0 };
    },
  );

  // Cartes suivantes d'une colonne (« voir plus »).
  r.get(
    "/pipeline/:stage",
    {
      preHandler: viewer,
      schema: {
        params: z.object({ stage: z.enum(PIPELINE_STAGES) }),
        querystring: pipelineMoreQuerySchema,
        response: { 200: pipelineMoreSchema },
      },
    },
    async (req) => {
      const { offset, limit, ...filters } = req.query;
      const where = and(eq(leads.stage, req.params.stage), ...boardFilters(filters));
      const [rows, [total]] = await Promise.all([
        joined().where(where).orderBy(desc(leads.updatedAt), asc(leads.id)).limit(limit).offset(offset),
        db
          .select({ n: count() })
          .from(leads)
          .innerJoin(companies, eq(companies.id, leads.companyId))
          .leftJoin(contacts, eq(contacts.id, leads.contactId))
          .where(where),
      ]);
      return { items: rows.map(toSummary), total: total?.n ?? 0 };
    },
  );

  // Liste des comptes actifs pour attribuer un responsable (les responsables n'ont pas accès à la gestion des utilisateurs).
  r.get(
    "/users/options",
    { preHandler: app.requireRole("MANAGER"), schema: { response: { 200: z.array(userOptionSchema) } } },
    async () =>
      db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.active, true))
        .orderBy(asc(users.name), asc(users.id)),
  );
}
