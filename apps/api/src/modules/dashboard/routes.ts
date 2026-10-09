import { type Dashboard, dashboardQuerySchema, dashboardSchema, PIPELINE_STAGES } from "@gac/shared";
import { and, desc, eq, or, type SQL, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { emailMessages, leads } from "../../db/schema";
import { toSummary } from "../leads/dto";
import { leadReader } from "../leads/read";

/** Condition de période sur une colonne de date de détection (undefined = toute la période). */
export function periodWhere(
  column: SQL,
  q: { period: string; from?: string | undefined; to?: string | undefined },
): SQL | undefined {
  if (q.period === "all") return undefined;
  if (q.period === "custom") {
    return sql`${column} >= ${q.from}::date and ${column} < (${q.to}::date + 1)`;
  }
  return sql`${column} >= now() - make_interval(days => ${Number(q.period)})`;
}

const n = (v: unknown) => Number(v ?? 0);

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { joined } = leadReader(db);

  r.get(
    "/dashboard",
    {
      preHandler: app.requireRole("VIEWER"),
      schema: { querystring: dashboardQuerySchema, response: { 200: dashboardSchema } },
    },
    async (req): Promise<Dashboard> => {
      const q = req.query;
      const when = periodWhere(sql`l.detected_at`, q);
      const whereSql = when ? sql`where ${when}` : sql``;
      const andSql = when ? sql`and ${when}` : sql``;
      const leadWhen = periodWhere(sql`${leads.detectedAt}`, q);

      const [kpi, qualification, sectors, pipeline, priority, recent] = await Promise.all([
        db.execute<Record<string, string>>(sql`
          select count(*)::text as leads,
            count(*) filter (where l.qualification in ('Chaud','Tiède'))::text as qualified,
            count(*) filter (where m.validation = 'Validé')::text as emails_validated,
            count(*) filter (where m.status is not null)::text as emails_sent,
            count(*) filter (where l.call_state = 'À appeler')::text as to_call,
            count(*) filter (where l.stage = 'RDV programmé')::text as appointments,
            count(*) filter (where l.stage = 'Gagné')::text as won,
            coalesce(sum(l.deal_value) filter (where l.stage = 'Gagné'), 0)::text as won_value,
            count(*) filter (where l.stage is not null and l.stage not in ('Gagné','Perdu'))::text as active_pipeline,
            coalesce(sum(l.deal_value) filter (where l.stage is not null and l.stage not in ('Gagné','Perdu')), 0)::text as pipeline_value,
            count(*) filter (where l.deal_value is not null and l.stage is not null and l.stage not in ('Gagné','Perdu'))::text as open_deals
          from leads l left join email_messages m on m.lead_id = l.id and m.sequence_no = 1 ${whereSql}`),
        db.execute<{ k: string; c: string }>(
          sql`select coalesce(l.qualification::text, 'Non qualifié') as k, count(*)::text as c from leads l ${whereSql} group by 1`,
        ),
        db.execute<{ k: string; c: string }>(sql`
          select coalesce(nullif(trim(c.sector), ''), 'Non renseigné') as k, count(*)::text as c
          from leads l join companies c on c.id = l.company_id ${whereSql} group by 1`),
        db.execute<{ stage: string; c: string; v: string }>(sql`
          select l.stage::text as stage, count(*)::text as c, coalesce(sum(l.deal_value), 0)::text as v
          from leads l where l.stage is not null ${andSql} group by 1`),
        joined()
          .where(
            and(
              eq(leads.qualification, "Chaud"),
              or(sql`${emailMessages.validation} is null`, eq(emailMessages.validation, "Pas Validé")),
              leadWhen,
            ),
          )
          .orderBy(desc(leads.detectedAt), leads.id)
          .limit(6),
        joined().where(leadWhen).orderBy(desc(leads.detectedAt), leads.id).limit(8),
      ]);

      const k = kpi.rows[0] ?? {};
      const bySector = sectors.rows
        .map((s) => ({ label: s.k, count: n(s.c) }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
      const named = bySector.filter((s) => s.label !== "Non renseigné");
      const unknown = bySector.find((s) => s.label === "Non renseigné");
      const top = named.slice(0, 6);
      const others = named.slice(6).reduce((sum, s) => sum + s.count, 0);

      return {
        kpis: {
          leads: n(k.leads),
          qualified: n(k.qualified),
          emailsValidated: n(k.emails_validated),
          emailsSent: n(k.emails_sent),
          toCall: n(k.to_call),
          appointments: n(k.appointments),
          won: n(k.won),
          wonValue: n(k.won_value),
          activePipeline: n(k.active_pipeline),
          pipelineValue: n(k.pipeline_value),
          openDeals: n(k.open_deals),
        },
        qualification: Object.fromEntries(qualification.rows.map((x) => [x.k, n(x.c)])),
        sectors: [
          ...top,
          ...(others ? [{ label: "Autres", count: others }] : []),
          ...(unknown ? [unknown] : []),
        ],
        pipeline: PIPELINE_STAGES.flatMap((stage) => {
          const row = pipeline.rows.find((p) => p.stage === stage);
          return row ? [{ stage, count: n(row.c), value: n(row.v) }] : [];
        }),
        priority: priority.map(toSummary),
        recent: recent.map(toSummary),
      };
    },
  );
}
