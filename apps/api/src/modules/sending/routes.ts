import {
  addSuppressionSchema,
  leadDetailSchema,
  pauseSchema,
  sendStatusSchema,
  testSendSchema,
} from "@gac/shared";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { emailMessages, leadEvents, suppressions } from "../../db/schema";
import { authOf } from "../../lib/assert";
import { audit } from "../../lib/audit";
import { AppError, conflict, notFound } from "../../lib/errors";
import { leadReader } from "../leads/read";
import { buildOutgoing, sendStatus, setPaused } from "./service";

const idParams = z.object({ id: z.uuid() });

export async function sendingRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const manager = app.requireRole("MANAGER");
  const admin = app.requireRole("ADMIN");
  const { detail } = leadReader(db);

  r.get(
    "/emails/send-status",
    { preHandler: manager, schema: { response: { 200: sendStatusSchema } } },
    async () => sendStatus(db, config),
  );

  r.post(
    "/emails/send-pause",
    { preHandler: admin, schema: { body: pauseSchema, response: { 200: sendStatusSchema } } },
    async (req) => {
      const actor = authOf(req).user;
      await setPaused(db, req.body.paused, actor.id);
      await audit(db, {
        actorId: actor.id,
        action: req.body.paused ? "emails.send_paused" : "emails.send_resumed",
        entityType: "settings",
        ip: req.ip,
      });
      return sendStatus(db, config);
    },
  );

  /** Envoie UN e-mail de test, à l'adresse de test configurée (jamais au prospect), sans rien marquer comme envoyé. */
  r.post(
    "/emails/test-send",
    {
      preHandler: admin,
      schema: { body: testSendSchema, response: { 200: z.object({ sentTo: z.string() }) } },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req) => {
      const to = config.SEND_TEST_RECIPIENT;
      if (!app.mailSender || !to) {
        throw conflict("L'envoi de test n'est pas configuré (BREVO_API_KEY et SEND_TEST_RECIPIENT)");
      }
      const [row] = await db
        .select({
          subject: emailMessages.subject,
          body: emailMessages.body,
          prompt: emailMessages.promptVersion,
        })
        .from(emailMessages)
        .where(and(eq(emailMessages.leadId, req.body.leadId), eq(emailMessages.sequenceNo, 1)))
        .limit(1);
      if (!row?.subject?.trim() || !row.body?.trim())
        throw notFound("E-mail introuvable ou vide pour ce lead");
      const result = await app.mailSender.send(
        buildOutgoing(
          config,
          { to, subject: row.subject, body: row.body, promptVersion: row.prompt },
          { test: true },
        ),
      );
      if (result.kind !== "sent") {
        throw new AppError(502, "INTERNAL_ERROR", `L'envoi de test a échoué (${result.reason})`);
      }
      const actor = authOf(req).user;
      await db
        .insert(leadEvents)
        .values({ leadId: req.body.leadId, actorId: actor.id, type: "email_test_sent", data: {} });
      return { sentTo: to };
    },
  );

  /**
   * Libère un envoi dont le résultat était incertain, APRÈS vérification dans l'historique Brevo qu'il n'est pas parti.
   * Il redevient éligible. À ne jamais faire sans avoir regardé : c'est le seul chemin vers un doublon.
   */
  r.post(
    "/leads/:id/email/release",
    { preHandler: admin, schema: { params: idParams, response: { 200: leadDetailSchema } } },
    async (req) => {
      const actor = authOf(req).user;
      const rows = await db
        .update(emailMessages)
        .set({ sendingAt: null, sendError: null, updatedAt: new Date() })
        .where(
          and(
            eq(emailMessages.leadId, req.params.id),
            eq(emailMessages.sequenceNo, 1),
            isNotNull(emailMessages.sendingAt),
            isNull(emailMessages.status),
          ),
        )
        .returning({ id: emailMessages.id });
      if (!rows.length) throw conflict("Aucun envoi incertain à libérer pour ce lead");
      await db
        .insert(leadEvents)
        .values({ leadId: req.params.id, actorId: actor.id, type: "email_send_released", data: {} });
      await audit(db, {
        actorId: actor.id,
        action: "emails.send_released",
        entityType: "lead",
        entityId: req.params.id,
        ip: req.ip,
      });
      return detail(req.params.id);
    },
  );

  /** Exclusion manuelle (réponse « stop » reçue par e-mail, demande orale…). Irréversible depuis l'interface. */
  r.post(
    "/suppressions",
    {
      preHandler: manager,
      schema: {
        body: addSuppressionSchema,
        response: { 200: z.object({ email: z.string(), created: z.boolean() }) },
      },
    },
    async (req) => {
      const actor = authOf(req).user;
      const { email, note } = req.body;
      const inserted = await db
        .insert(suppressions)
        .values({ email, reason: "manual", note: note ?? null })
        .onConflictDoNothing()
        .returning({ email: suppressions.email });
      await audit(db, {
        actorId: actor.id,
        action: "suppressions.add",
        entityType: "suppression",
        data: { created: inserted.length > 0 },
        ip: req.ip,
      });
      // un e-mail validé mais pas encore envoyé vers cette adresse repart en relecture
      await db.execute(sql`update email_messages set validation = 'Pas Validé', validated_at = null, validated_by = null, updated_at = now()
        where status is null and validation = 'Validé' and lead_id in
        (select l.id from leads l join contacts c on c.id = l.contact_id where lower(c.email) = ${email})`);
      return { email, created: inserted.length > 0 };
    },
  );
}
