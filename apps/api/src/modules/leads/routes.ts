import {
  type LeadEvent,
  leadDetailSchema,
  leadFacetsSchema,
  leadListQuerySchema,
  leadSummarySchema,
  updateLeadSchema,
} from "@gac/shared";
import { count, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { companies, contacts, emailMessages, leadEvents, leads, users } from "../../db/schema";
import { authOf } from "../../lib/assert";
import { notFound } from "../../lib/errors";
import { type JoinedRow, toDetail, toSummary } from "./dto";
import { leadFilters, leadOrder } from "./queries";
import { updateLead } from "./update";

const idParams = z.object({ id: z.uuid() });
const pageSchema = z.object({
  items: z.array(leadSummarySchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export async function leadsRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const viewer = app.requireRole("VIEWER");
  const agent = app.requireRole("AGENT");

  /** Lead, entreprise, contact et premier e-mail : la forme de base de toutes les lectures. */
  const joined = () =>
    db
      .select({ lead: leads, company: companies, contact: contacts, message: emailMessages })
      .from(leads)
      .innerJoin(companies, eq(companies.id, leads.companyId))
      .leftJoin(contacts, eq(contacts.id, leads.contactId))
      .leftJoin(
        emailMessages,
        sql`${emailMessages.leadId} = ${leads.id} and ${emailMessages.sequenceNo} = 1`,
      );

  r.get(
    "/leads",
    { preHandler: viewer, schema: { querystring: leadListQuerySchema, response: { 200: pageSchema } } },
    async (req) => {
      const f = req.query;
      const where = leadFilters(f);
      const [rows, [total]] = await Promise.all([
        joined()
          .where(where)
          .orderBy(...leadOrder(f.sort, f.order))
          .limit(f.limit)
          .offset(f.offset),
        db
          .select({ n: count() })
          .from(leads)
          .innerJoin(companies, eq(companies.id, leads.companyId))
          .leftJoin(contacts, eq(contacts.id, leads.contactId))
          .leftJoin(
            emailMessages,
            sql`${emailMessages.leadId} = ${leads.id} and ${emailMessages.sequenceNo} = 1`,
          )
          .where(where),
      ]);
      return { items: rows.map(toSummary), total: total?.n ?? 0, limit: f.limit, offset: f.offset };
    },
  );

  /** Effectifs par valeur de chaque filtre (menus et compteurs), sans tenir compte des autres filtres. */
  r.get(
    "/leads/facets",
    { preHandler: viewer, schema: { response: { 200: leadFacetsSchema } } },
    async () => {
      const group = async (expression: ReturnType<typeof sql>, from: ReturnType<typeof sql>) => {
        const { rows } = await db.execute<{ k: string; n: string }>(
          sql`select ${expression} as k, count(*)::text as n ${from} group by 1`,
        );
        return Object.fromEntries(rows.map((x) => [x.k, Number(x.n)]));
      };
      const base = sql`from leads l`;
      const withCompany = sql`from leads l join companies c on c.id = l.company_id`;
      const withMessage = sql`from leads l left join email_messages m on m.lead_id = l.id and m.sequence_no = 1`;
      const [total, qualification, stage, service, segment, source, validation, emailStatus, callState] =
        await Promise.all([
          db.select({ n: count() }).from(leads),
          group(sql`coalesce(l.qualification::text, 'none')`, base),
          group(sql`coalesce(l.stage::text, 'none')`, base),
          group(sql`coalesce(l.service::text, 'none')`, base),
          group(sql`case when c.domain is null then 'no_website' else 'with_website' end`, withCompany),
          group(sql`l.source`, base),
          group(sql`coalesce(m.validation::text, 'none')`, withMessage),
          group(sql`coalesce(m.status::text, 'none')`, withMessage),
          group(sql`coalesce(l.call_state::text, 'none')`, base),
        ]);
      return {
        total: total[0]?.n ?? 0,
        qualification,
        stage,
        service,
        segment,
        source,
        validation,
        emailStatus,
        callState,
      };
    },
  );

  async function detail(id: string) {
    const [row] = await joined().where(eq(leads.id, id)).limit(1);
    if (!row) throw notFound("Lead introuvable");
    const [owner] = row.lead.ownerId
      ? await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.id, row.lead.ownerId))
          .limit(1)
      : [];
    const events = await db
      .select({
        id: leadEvents.id,
        at: leadEvents.at,
        type: leadEvents.type,
        data: leadEvents.data,
        actorName: users.name,
      })
      .from(leadEvents)
      .leftJoin(users, eq(users.id, leadEvents.actorId))
      .where(eq(leadEvents.leadId, id))
      .orderBy(desc(leadEvents.at), desc(leadEvents.id))
      .limit(50);
    const history: LeadEvent[] = events.map((e) => ({ ...e, at: e.at.toISOString() }));
    return toDetail(row satisfies JoinedRow, owner ?? null, history);
  }

  r.get(
    "/leads/:id",
    { preHandler: viewer, schema: { params: idParams, response: { 200: leadDetailSchema } } },
    async (req) => detail(req.params.id),
  );

  r.patch(
    "/leads/:id",
    {
      preHandler: agent,
      schema: { params: idParams, body: updateLeadSchema, response: { 200: leadDetailSchema } },
    },
    async (req) => {
      await updateLead(db, req.params.id, req.body, authOf(req).user);
      return detail(req.params.id);
    },
  );
}
