import {
  AUDIT_CONSENT_TEXT,
  AUDIT_REQUEST_ROLE,
  AUDIT_REQUEST_STATUSES,
  type AuditRequest,
  auditRequestConvertResultSchema,
  auditRequestListQuerySchema,
  auditRequestPageSchema,
  auditRequestSchema,
  auditRequestUpdateSchema,
  publicAuditRequestSchema,
} from "@gac/shared";
import { and, count, desc, eq, gte, ilike, or, type SQL, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { auditRequests, leadEvents, users } from "../../db/schema";
import { cleanText, normalizeDomain, normalizeEmail, normalizePhone } from "../../import/normalize";
import { authOf } from "../../lib/assert";
import { audit } from "../../lib/audit";
import { createLead } from "../../lib/create-lead";
import { AppError, conflict, forbidden, notFound } from "../../lib/errors";
import { effectiveConfig } from "../settings/effective";
import { processNewRequest, sendAck } from "./ack";

const idParams = z.object({ id: z.uuid() });
type Row = typeof auditRequests.$inferSelect;

export async function auditRequestsRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const staff = app.requireRole(AUDIT_REQUEST_ROLE);

  /** Ajoute les en-têtes CORS pour un site autorisé ; refuse une origine inconnue. Sans en-tête Origin : requête serveur à serveur. */
  function cors(req: FastifyRequest, reply: FastifyReply): void {
    const origin = req.headers.origin;
    if (!origin) return;
    if (!config.AUDIT_FORM_ORIGINS.includes(origin)) throw forbidden("Origine non autorisée");
    reply.header("access-control-allow-origin", origin);
    reply.header("vary", "Origin");
  }

  // ── Formulaire du site (public) ─────────────────────────────────────────────────────────────────────────────────────
  app.options("/public/audit-requests", async (req, reply) => {
    cors(req, reply);
    return reply
      .header("access-control-allow-methods", "POST, OPTIONS")
      .header("access-control-allow-headers", "content-type")
      .header("access-control-max-age", "600")
      .code(204)
      .send();
  });

  r.post(
    "/public/audit-requests",
    {
      schema: { body: publicAuditRequestSchema, response: { 201: z.object({ ok: z.literal(true) }) } },
      config: { rateLimit: { max: config.AUDIT_FORM_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      cors(req, reply);
      const b = req.body;
      // Robot : le champ piège est rempli. On répond comme si tout allait bien, sans rien enregistrer.
      if (b.hp?.trim()) return reply.code(201).send({ ok: true });

      const email = normalizeEmail(b.email);
      if (!email) throw new AppError(400, "VALIDATION_ERROR", "Adresse e-mail invalide");
      const website = cleanText(b.website) ?? b.website;
      const domain = normalizeDomain(website);
      if (!domain)
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Site web illisible : indiquez son adresse (ex. monsite.fr)",
        );

      // Double clic ou renvoi : la même demande (mêmes réponses) dans les dix dernières minutes n'est enregistrée qu'une fois.
      const [dup] = await db
        .select({ id: auditRequests.id })
        .from(auditRequests)
        .where(
          and(
            eq(auditRequests.email, email),
            sql`lower(${auditRequests.website}) = ${website.toLowerCase()}`,
            sql`coalesce(${auditRequests.subject}, '') = ${cleanText(b.subject) ?? ""}`,
            sql`coalesce(${auditRequests.message}, '') = ${cleanText(b.message) ?? ""}`,
            gte(auditRequests.createdAt, sql`now() - interval '10 minutes'`),
          ),
        )
        .limit(1);
      if (dup) return reply.code(201).send({ ok: true });

      const [row] = await db
        .insert(auditRequests)
        .values({
          companyName: cleanText(b.companyName) ?? b.companyName,
          website,
          email,
          phone: cleanText(b.phone),
          subject: cleanText(b.subject),
          message: cleanText(b.message),
          consentText: AUDIT_CONSENT_TEXT,
        })
        .returning({ id: auditRequests.id });
      if (!row) throw new AppError(500, "INTERNAL_ERROR", "Enregistrement impossible");
      await audit(db, {
        action: "audit_request.received",
        entityType: "audit_request",
        entityId: row.id,
        ip: req.ip,
      });
      // L'accusé et l'alerte partent après la réponse : le visiteur n'attend pas le fournisseur d'e-mails.
      const id = row.id;
      setImmediate(() => void processNewRequest({ db, config, sender: app.mailSender }, id));
      return reply.code(201).send({ ok: true });
    },
  );

  // ── Traitement par l'équipe ─────────────────────────────────────────────────────────────────────────────────────────
  const suppressed = sql<boolean>`exists (select 1 from suppressions s where s.email = ${auditRequests.email}
    and s.reason in ('bounce', 'complaint', 'manual'))`;
  const knownLead = sql<string | null>`(select l.id from leads l join contacts c on c.id = l.contact_id
    where c.email = ${auditRequests.email} limit 1)`;

  const toDto = (row: Row, extra: { suppressed: boolean; knownLeadId: string | null }): AuditRequest => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    companyName: row.companyName,
    website: row.website,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    status: row.status,
    note: row.note,
    ownerId: row.ownerId,
    ackStatus: row.ackStatus,
    ackSentAt: row.ackSentAt?.toISOString() ?? null,
    ackError: row.ackError,
    leadId: row.leadId,
    suppressed: extra.suppressed,
    knownLeadId: extra.knownLeadId,
  });

  async function one(id: string): Promise<AuditRequest> {
    const [x] = await db
      .select({ row: auditRequests, suppressed, knownLeadId: knownLead })
      .from(auditRequests)
      .where(eq(auditRequests.id, id))
      .limit(1);
    if (!x) throw notFound("Demande introuvable");
    return toDto(x.row, { suppressed: Boolean(x.suppressed), knownLeadId: x.knownLeadId });
  }

  r.get(
    "/audit-requests",
    {
      preHandler: staff,
      schema: { querystring: auditRequestListQuerySchema, response: { 200: auditRequestPageSchema } },
    },
    async (req) => {
      const { status, q, limit, offset } = req.query;
      const search: SQL | undefined = q
        ? or(
            ilike(auditRequests.companyName, `%${q}%`),
            ilike(auditRequests.email, `%${q}%`),
            ilike(auditRequests.website, `%${q}%`),
          )
        : undefined;
      const where = and(search, status ? eq(auditRequests.status, status) : undefined);
      const [rows, [total], grouped] = await Promise.all([
        db
          .select({ row: auditRequests, suppressed, knownLeadId: knownLead })
          .from(auditRequests)
          .where(where)
          .orderBy(desc(auditRequests.createdAt), desc(auditRequests.id))
          .limit(limit)
          .offset(offset),
        db.select({ n: count() }).from(auditRequests).where(where),
        db
          .select({ status: auditRequests.status, n: count() })
          .from(auditRequests)
          .where(search)
          .groupBy(auditRequests.status),
      ]);
      const byStatus: Record<string, number> = Object.fromEntries(AUDIT_REQUEST_STATUSES.map((s) => [s, 0]));
      for (const g of grouped) byStatus[g.status] = g.n;
      return {
        items: rows.map((x) =>
          toDto(x.row, { suppressed: Boolean(x.suppressed), knownLeadId: x.knownLeadId }),
        ),
        total: total?.n ?? 0,
        limit,
        offset,
        byStatus,
      };
    },
  );

  /** Nombre de demandes à traiter : alimente le badge du menu. */
  r.get(
    "/audit-requests/summary",
    { preHandler: staff, schema: { response: { 200: z.object({ pending: z.number() }) } } },
    async () => {
      const [x] = await db
        .select({ n: count() })
        .from(auditRequests)
        .where(eq(auditRequests.status, "Nouvelle"));
      return { pending: x?.n ?? 0 };
    },
  );

  r.patch(
    "/audit-requests/:id",
    {
      preHandler: staff,
      schema: { params: idParams, body: auditRequestUpdateSchema, response: { 200: auditRequestSchema } },
    },
    async (req) => {
      const { id } = req.params;
      const b = req.body;
      const [cur] = await db.select().from(auditRequests).where(eq(auditRequests.id, id)).limit(1);
      if (!cur) throw notFound("Demande introuvable");
      if (b.status === "Convertie" && !cur.leadId) {
        throw conflict("Pour convertir une demande, utilisez « Convertir en lead »");
      }
      if (b.ownerId) {
        const [u] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, b.ownerId), eq(users.active, true)))
          .limit(1);
        if (!u) throw new AppError(400, "VALIDATION_ERROR", "Responsable introuvable ou désactivé");
      }
      await db
        .update(auditRequests)
        .set({
          ...(b.status !== undefined ? { status: b.status } : {}),
          ...(b.note !== undefined ? { note: cleanText(b.note) } : {}),
          ...(b.ownerId !== undefined ? { ownerId: b.ownerId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(auditRequests.id, id));
      await audit(db, {
        actorId: authOf(req).user.id,
        action: "audit_request.updated",
        entityType: "audit_request",
        entityId: id,
        data: { status: b.status, ownerChanged: b.ownerId !== undefined, noteChanged: b.note !== undefined },
        ip: req.ip,
      });
      return one(id);
    },
  );

  /** Renvoie l'accusé de réception (envoi qui n'est pas parti : serveur en mode test, panne du fournisseur). */
  r.post(
    "/audit-requests/:id/resend-ack",
    {
      preHandler: staff,
      schema: { params: idParams, response: { 200: auditRequestSchema } },
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (req) => {
      const { id } = req.params;
      const [row] = await db.select().from(auditRequests).where(eq(auditRequests.id, id)).limit(1);
      if (!row) throw notFound("Demande introuvable");
      if (row.ackStatus === "sent") throw conflict("L'accusé de réception est déjà parti");
      await sendAck({ db, config: await effectiveConfig(db, config), sender: app.mailSender }, row);
      await audit(db, {
        actorId: authOf(req).user.id,
        action: "audit_request.ack_resent",
        entityType: "audit_request",
        entityId: id,
        ip: req.ip,
      });
      return one(id);
    },
  );

  /**
   * Convertit la demande en lead de prospection (qualifié « Chaud » : la personne a levé la main). Si le prospect existe
   * déjà, la demande y est rattachée : aucun doublon.
   */
  r.post(
    "/audit-requests/:id/convert",
    {
      preHandler: staff,
      schema: { params: idParams, response: { 200: auditRequestConvertResultSchema } },
    },
    async (req) => {
      const { id } = req.params;
      const actor = authOf(req).user;
      const [row] = await db.select().from(auditRequests).where(eq(auditRequests.id, id)).limit(1);
      if (!row) throw notFound("Demande introuvable");
      if (row.leadId) {
        return { leadId: row.leadId, existing: true, request: await one(id) };
      }
      const phone = normalizePhone(row.phone);
      const comment = [
        `Demande d'audit du site${row.subject ? ` : ${row.subject}` : ""}`,
        row.message ?? "",
        row.phone && !phone ? `Téléphone indiqué : ${row.phone}` : "",
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2000);
      let leadId: string;
      let existing = false;
      try {
        leadId = await createLead(
          db,
          {
            companyName: row.companyName,
            website: row.website,
            email: row.email,
            ...(phone ? { phone: row.phone ?? undefined } : {}),
            qualification: "Chaud",
            comment,
          },
          { actorId: actor.id, source: "Demande d'audit (site)", eventData: { auditRequestId: id } },
        );
      } catch (e) {
        const found =
          e instanceof AppError && e.statusCode === 409
            ? (e.details as { leadId?: string } | undefined)?.leadId
            : undefined;
        if (!found) throw e;
        leadId = found;
        existing = true;
        await db.insert(leadEvents).values({
          leadId,
          actorId: actor.id,
          type: "audit_request_linked",
          data: { auditRequestId: id, subject: row.subject },
        });
      }
      await db
        .update(auditRequests)
        .set({ leadId, status: "Convertie", updatedAt: new Date() })
        .where(eq(auditRequests.id, id));
      await audit(db, {
        actorId: actor.id,
        action: "audit_request.converted",
        entityType: "audit_request",
        entityId: id,
        data: { leadId, existing },
        ip: req.ip,
      });
      return { leadId, existing, request: await one(id) };
    },
  );
}
