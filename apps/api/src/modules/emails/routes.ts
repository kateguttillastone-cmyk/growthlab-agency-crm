import {
  addressCheckRequestSchema,
  addressCheckResultSchema,
  BULK_MAX,
  type BulkEmailResult,
  bulkEmailResultSchema,
  bulkEmailSchema,
  type EmailStats,
  emailPreviewRequestSchema,
  emailPreviewSchema,
  emailStatsSchema,
  leadDetailSchema,
  updateEmailSchema,
} from "@gac/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { companies, contacts, emailMessages, leadEvents, leads, suppressions } from "../../db/schema";
import { authOf } from "../../lib/assert";
import { audit } from "../../lib/audit";
import { AppError, conflict, notFound } from "../../lib/errors";
import { renderEmail } from "../../mail/template";
import { leadFilters } from "../leads/queries";
import { leadReader } from "../leads/read";
import { runAddressCheck } from "./address-check";
import { bulkClassification, reviewBlocker } from "./rules";

const idParams = z.object({ id: z.uuid() });

export async function emailsRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const manager = app.requireRole("MANAGER");
  const { detail } = leadReader(db);
  const identity = {
    fromName: config.MAIL_FROM_NAME,
    fromAddress: config.MAIL_FROM_ADDRESS,
    agendaText: config.MAIL_AGENDA_TEXT,
    signature: config.MAIL_SIGNATURE,
  };

  /** Aperçu fidèle : le même gabarit que l'envoi, appliqué au texte en cours d'édition. */
  r.post(
    "/emails/preview",
    {
      preHandler: manager,
      schema: { body: emailPreviewRequestSchema, response: { 200: emailPreviewSchema } },
    },
    async (req) => renderEmail(req.body, identity),
  );

  r.get(
    "/emails/stats",
    { preHandler: manager, schema: { response: { 200: emailStatsSchema } } },
    async () => {
      const { rows } = await db.execute<{
        to_review: string;
        to_review_no_recipient: string;
        address_unchecked: string;
        address_invalid: string;
        validated_not_sent: string;
        rejected: string;
        sent: string;
      }>(sql`
      select
        count(*) filter (where m.validation = 'Pas Validé' and m.status is null and c.email is not null and s.email is null)::text as to_review,
        count(*) filter (where m.validation = 'Pas Validé' and m.status is null and (c.email is null or s.email is not null))::text as to_review_no_recipient,
        count(*) filter (where m.status is null and m.validation <> 'Rejeté' and c.email is not null and c.email_check is null)::text as address_unchecked,
        count(*) filter (where m.status is null and m.validation <> 'Rejeté' and c.email_check is not null and c.email_check <> 'valid')::text as address_invalid,
        count(*) filter (where m.validation = 'Validé' and m.status is null)::text as validated_not_sent,
        count(*) filter (where m.validation = 'Rejeté' and m.status is null)::text as rejected,
        count(*) filter (where m.status is not null)::text as sent
      from email_messages m
      join leads l on l.id = m.lead_id
      left join contacts c on c.id = l.contact_id
      left join suppressions s on s.email = lower(c.email)
      where m.sequence_no = 1`);
      const { rows: prompts } = await db.execute<{
        version: string;
        pending: string;
        sent: string;
        opened: string;
        bounced: string;
        unsubscribed: string;
      }>(sql`
      select coalesce(prompt_version, '(inconnue)') as version,
        count(*) filter (where status is null)::text as pending,
        count(*) filter (where status is not null)::text as sent,
        count(*) filter (where status = 'Ouvert')::text as opened,
        count(*) filter (where status = 'Bounce')::text as bounced,
        count(*) filter (where status = 'Désinscrit')::text as unsubscribed
      from email_messages where sequence_no = 1
      group by 1 order by 1`);
      const x = rows[0];
      const stats: EmailStats = {
        toReview: Number(x?.to_review ?? 0),
        toReviewNoRecipient: Number(x?.to_review_no_recipient ?? 0),
        addressUnchecked: Number(x?.address_unchecked ?? 0),
        addressInvalid: Number(x?.address_invalid ?? 0),
        validatedNotSent: Number(x?.validated_not_sent ?? 0),
        rejected: Number(x?.rejected ?? 0),
        sent: Number(x?.sent ?? 0),
        byPrompt: prompts.map((p) => ({
          version: p.version,
          pending: Number(p.pending),
          sent: Number(p.sent),
          opened: Number(p.opened),
          bounced: Number(p.bounced),
          unsubscribed: Number(p.unsubscribed),
        })),
      };
      return stats;
    },
  );

  /** Contrôle des adresses (syntaxe, adresse jetable, serveur de messagerie) avant relecture et envoi. */
  r.post(
    "/emails/address-check",
    {
      preHandler: manager,
      schema: { body: addressCheckRequestSchema, response: { 200: addressCheckResultSchema } },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req) => {
      const actor = authOf(req).user;
      const result = await runAddressCheck(db, {
        limit: req.body.limit,
        actorId: actor.id,
        resolver: app.dnsResolver,
      });
      await audit(db, {
        actorId: actor.id,
        action: "emails.address_check",
        entityType: "contact",
        data: { ...result },
        ip: req.ip,
      });
      return result;
    },
  );

  r.patch(
    "/leads/:id/email",
    {
      preHandler: manager,
      schema: { params: idParams, body: updateEmailSchema, response: { 200: leadDetailSchema } },
    },
    async (req) => {
      const { id } = req.params;
      const input = req.body;
      const actor = authOf(req).user;
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select({
            message: emailMessages,
            email: contacts.email,
            addressCheck: contacts.emailCheck,
            blocked: suppressions.reason,
          })
          .from(emailMessages)
          .innerJoin(leads, eq(leads.id, emailMessages.leadId))
          .leftJoin(contacts, eq(contacts.id, leads.contactId))
          .leftJoin(suppressions, sql`${suppressions.email} = lower(${contacts.email})`)
          .where(and(eq(emailMessages.leadId, id), eq(emailMessages.sequenceNo, 1)))
          .for("update", { of: emailMessages })
          .limit(1);
        if (!row) throw notFound("E-mail introuvable pour ce lead");
        const current = row.message;
        if (current.status !== null || current.sentOn !== null) {
          throw conflict("Cet e-mail a déjà été envoyé : il n'est plus modifiable");
        }
        if (
          input.expectedUpdatedAt &&
          new Date(input.expectedUpdatedAt).getTime() !== current.updatedAt.getTime()
        ) {
          throw conflict("Cet e-mail a été modifié par quelqu'un d'autre : rechargez la fiche");
        }

        const subject = input.subject ?? current.subject;
        const body = input.body ?? current.body;
        const edited =
          (input.subject !== undefined && input.subject !== current.subject) ||
          (input.body !== undefined && input.body !== current.body);
        // Un texte modifié doit être relu à nouveau, sauf si la même requête le valide explicitement.
        const target = input.validation ?? (edited ? "Pas Validé" : current.validation);
        if (target === "Validé") {
          const blocker = reviewBlocker({
            subject,
            body,
            email: row.email,
            blocked: row.blocked,
            addressCheck: row.addressCheck,
          });
          if (blocker) throw conflict(blocker);
        }

        const validationChanged = target !== current.validation;
        if (!edited && !validationChanged) return;
        const now = new Date();
        await tx
          .update(emailMessages)
          .set({
            subject,
            body,
            validation: target,
            validatedAt: target === "Validé" ? now : null,
            validatedBy: target === "Validé" ? actor.id : null,
            updatedAt: now,
          })
          .where(eq(emailMessages.id, current.id));
        // Aucun contenu dans l'historique : seulement ce qui a changé.
        const events = [];
        if (edited) {
          events.push({
            leadId: id,
            actorId: actor.id,
            type: "email_edited",
            data: {
              fields: [
                ...(input.subject !== undefined && input.subject !== current.subject ? ["subject"] : []),
                ...(input.body !== undefined && input.body !== current.body ? ["body"] : []),
              ],
            },
          });
        }
        if (validationChanged) {
          events.push({
            leadId: id,
            actorId: actor.id,
            type: "email_validation",
            data: { from: current.validation, to: target },
          });
        }
        await tx.insert(leadEvents).values(events);
      });
      return detail(id);
    },
  );

  r.post(
    "/emails/bulk",
    { preHandler: manager, schema: { body: bulkEmailSchema, response: { 200: bulkEmailResultSchema } } },
    async (req) => {
      const { validation, filter, dryRun, expectedCount } = req.body;
      if (!dryRun && expectedCount === undefined) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Lancez d'abord une simulation (effectif attendu manquant)",
        );
      }
      const actor = authOf(req).user;
      const where = leadFilters(filter);

      const result = await db.transaction(async (tx): Promise<BulkEmailResult> => {
        const rows = await tx
          .select({
            id: emailMessages.id,
            leadId: emailMessages.leadId,
            validation: emailMessages.validation,
            status: emailMessages.status,
            subject: emailMessages.subject,
            body: emailMessages.body,
            email: contacts.email,
            addressCheck: contacts.emailCheck,
            blocked: suppressions.reason,
          })
          .from(leads)
          .innerJoin(companies, eq(companies.id, leads.companyId))
          .innerJoin(
            emailMessages,
            sql`${emailMessages.leadId} = ${leads.id} and ${emailMessages.sequenceNo} = 1`,
          )
          .leftJoin(contacts, eq(contacts.id, leads.contactId))
          .leftJoin(suppressions, sql`${suppressions.email} = lower(${contacts.email})`)
          .where(where)
          .for("update", { of: emailMessages });

        const { eligible, skipped } = bulkClassification(rows, validation);
        if (dryRun) return { dryRun: true, eligible: eligible.length, skipped };
        if (eligible.length !== expectedCount) {
          throw conflict(
            `Le nombre d'e-mails concernés a changé (${eligible.length} au lieu de ${expectedCount}) : relancez la simulation`,
          );
        }
        if (eligible.length > BULK_MAX) throw conflict("Trop d'e-mails d'un coup : affinez le filtre");
        if (eligible.length) {
          const now = new Date();
          const ids = eligible.map((e) => e.id);
          await tx
            .update(emailMessages)
            .set({
              validation,
              validatedAt: validation === "Validé" ? now : null,
              validatedBy: validation === "Validé" ? actor.id : null,
              updatedAt: now,
            })
            .where(inArray(emailMessages.id, ids));
          await tx.insert(leadEvents).values(
            eligible.map((e) => ({
              leadId: e.leadId,
              actorId: actor.id,
              type: "email_validation",
              data: { from: "Pas Validé", to: validation, bulk: true },
            })),
          );
        }
        return { dryRun: false, eligible: eligible.length, skipped };
      });
      if (!result.dryRun && result.eligible > 0) {
        await audit(db, {
          actorId: actor.id,
          action: "emails.bulk_validation",
          entityType: "email_message",
          data: { validation, count: result.eligible, filter },
          ip: req.ip,
        });
      }
      return result;
    },
  );
}
