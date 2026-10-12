import {
  createSavedViewSchema,
  leadListQuerySchema,
  SAVED_VIEW_PAGES,
  SAVED_VIEWS_MAX,
  savedViewSchema,
} from "@gac/shared";
import { and, asc, count, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { companies, contacts, emailMessages, leads, savedViews, users } from "../../db/schema";
import { authOf } from "../../lib/assert";
import { audit } from "../../lib/audit";
import { AppError, conflict, notFound } from "../../lib/errors";
import { toSummary } from "./dto";
import { leadFilters, leadOrder } from "./queries";
import { leadReader } from "./read";

export const EXPORT_MAX = 20_000;
const PAGE = 1000;

/** Critères qu'une vue peut mémoriser : ceux de la liste (hors pagination), plus l'onglet. */
const VIEW_KEYS = new Set([
  ...Object.keys(leadListQuerySchema.shape).filter((k) => k !== "limit" && k !== "offset"),
  "tab",
]);

/** Un champ de tableur qui commencerait par = + - @ serait exécuté comme une formule : on le neutralise. */
export function csvCell(value: string | number | null | undefined, opts: { phone?: boolean } = {}): string {
  let v = value === null || value === undefined ? "" : String(value);
  const isPhone = opts.phone && /^\+?[\d ]+$/.test(v);
  if (!isPhone && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

const nationalPhone = (p: string | null) => {
  const m = p ? /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(p) : null;
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : (p ?? "");
};

export async function exportViewsRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { joined } = leadReader(db);

  /**
   * Export CSV (Excel français : séparateur « ; », accents conservés) de la liste filtrée. Contient des données
   * personnelles : réservé aux responsables, borné, limité en fréquence et tracé dans le journal d'audit.
   */
  r.get(
    "/leads/export",
    {
      preHandler: app.requireRole("MANAGER"),
      schema: { querystring: leadListQuerySchema.omit({ limit: true, offset: true }) },
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const { sort, order, ...filter } = req.query;
      const where = leadFilters(filter);
      const [total] = await db
        .select({ n: count() })
        .from(leads)
        .innerJoin(companies, eq(companies.id, leads.companyId))
        .leftJoin(contacts, eq(contacts.id, leads.contactId))
        .leftJoin(
          emailMessages,
          sql`${emailMessages.leadId} = ${leads.id} and ${emailMessages.sequenceNo} = 1`,
        )
        .where(where);
      const n = total?.n ?? 0;
      if (n > EXPORT_MAX) {
        throw conflict(
          `Trop de lignes (${n}) : affinez les filtres (maximum ${EXPORT_MAX.toLocaleString("fr-FR")})`,
        );
      }
      const owners = new Map(
        (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
      );
      const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
      const lines = [
        [
          "Entreprise",
          "Site web",
          "Secteur",
          "Ville",
          "Téléphone",
          "Contact",
          "E-mail",
          "Qualification",
          "Service",
          "Étape",
          "Statut d'appel",
          "File d'appel",
          "Validation e-mail",
          "Statut e-mail",
          "Détecté le",
          "Responsable",
        ]
          .map((h) => csvCell(h))
          .join(";"),
      ];
      for (let offset = 0; offset < n; offset += PAGE) {
        const rows = await joined()
          .where(where)
          .orderBy(...leadOrder(sort, order))
          .limit(PAGE)
          .offset(offset);
        for (const l of rows.map(toSummary)) {
          const person = [l.contact?.firstName, l.contact?.lastName].filter(Boolean).join(" ");
          lines.push(
            [
              csvCell(l.company.name),
              csvCell(l.company.website),
              csvCell(l.company.sector),
              csvCell(l.company.city),
              csvCell(nationalPhone(l.company.phone), { phone: true }),
              csvCell(person),
              csvCell(l.contact?.email),
              csvCell(l.qualification),
              csvCell(l.service),
              csvCell(l.stage),
              csvCell(l.callStatus),
              csvCell(l.callState),
              csvCell(l.email?.validation),
              csvCell(l.email?.status),
              csvCell(day(l.detectedAt)),
              csvCell(l.ownerId ? owners.get(l.ownerId) : null),
            ].join(";"),
          );
        }
      }
      await audit(db, {
        actorId: authOf(req).user.id,
        action: "leads.export",
        entityType: "lead",
        data: { rows: n, filter },
        ip: req.ip,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      return reply
        .header("content-disposition", `attachment; filename="leads-${stamp}.csv"`)
        .header("cache-control", "no-store")
        .type("text/csv; charset=utf-8")
        .send(`\ufeff${lines.join("\r\n")}\r\n`);
    },
  );

  r.get(
    "/views",
    {
      preHandler: app.requireRole("VIEWER"),
      schema: {
        querystring: z.object({ page: z.enum(SAVED_VIEW_PAGES) }),
        response: { 200: z.array(savedViewSchema) },
      },
    },
    async (req) => {
      const rows = await db
        .select()
        .from(savedViews)
        .where(and(eq(savedViews.userId, authOf(req).user.id), eq(savedViews.page, req.query.page)))
        .orderBy(asc(savedViews.name));
      return rows.map((v) => ({
        id: v.id,
        page: v.page as (typeof SAVED_VIEW_PAGES)[number],
        name: v.name,
        filters: v.filters,
        createdAt: v.createdAt.toISOString(),
      }));
    },
  );

  r.post(
    "/views",
    {
      preHandler: app.requireRole("VIEWER"),
      schema: { body: createSavedViewSchema, response: { 201: savedViewSchema } },
    },
    async (req, reply) => {
      const user = authOf(req).user;
      const { page, name, filters } = req.body;
      const unknown = Object.keys(filters).filter((k) => !VIEW_KEYS.has(k));
      if (unknown.length)
        throw new AppError(400, "VALIDATION_ERROR", `Critère inconnu : ${unknown.join(", ")}`);
      const [existing] = await db
        .select({ n: count() })
        .from(savedViews)
        .where(and(eq(savedViews.userId, user.id), eq(savedViews.page, page)));
      if ((existing?.n ?? 0) >= SAVED_VIEWS_MAX) {
        throw conflict(`Vous avez atteint le maximum de ${SAVED_VIEWS_MAX} vues pour cette page`);
      }
      try {
        const [row] = await db
          .insert(savedViews)
          .values({ userId: user.id, page, name, filters })
          .returning();
        if (!row) throw new AppError(500, "INTERNAL_ERROR", "Enregistrement impossible");
        return reply.code(201).send({
          id: row.id,
          page,
          name: row.name,
          filters: row.filters,
          createdAt: row.createdAt.toISOString(),
        });
      } catch (e) {
        if ((e as { code?: string; cause?: { code?: string } }).cause?.code === "23505") {
          throw conflict("Vous avez déjà une vue de ce nom");
        }
        throw e;
      }
    },
  );

  r.delete(
    "/views/:id",
    {
      preHandler: app.requireRole("VIEWER"),
      schema: { params: z.object({ id: z.uuid() }), response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      const rows = await db
        .delete(savedViews)
        .where(and(eq(savedViews.id, req.params.id), eq(savedViews.userId, authOf(req).user.id)))
        .returning({ id: savedViews.id });
      if (!rows.length) throw notFound("Vue introuvable");
      return { ok: true as const };
    },
  );
}
