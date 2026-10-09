import { timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { emailMessages, leadEvents, suppressions } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { verifyUnsubscribe } from "../../mail/unsubscribe-token";
import { advances, mapBrevoEvent } from "./events";

const eventSchema = z
  .object({ event: z.string(), email: z.string().optional(), "message-id": z.string().optional() })
  .loose();

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const page = (title: string, body: string, form?: string) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${body}</p>${form ?? ""}</main></body></html>`;

/** Routes publiques appelées par Brevo et par les destinataires : authentifiées par jeton, pas par session. */
export async function sendingPublicRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app;

  // Les clients de messagerie envoient « List-Unsubscribe=One-Click » en formulaire : on l'accepte sans l'exploiter.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, _body, done) =>
    done(null, {}),
  );

  /** Enregistre un retour du fournisseur : statut sans régression, exclusion de l'adresse, historique du lead. */
  async function applyEvent(ev: z.infer<typeof eventSchema>): Promise<void> {
    const mapped = mapBrevoEvent(ev.event);
    if (!mapped) return;
    const email = ev.email?.trim().toLowerCase();
    if (mapped.suppress && email) {
      await db
        .insert(suppressions)
        .values({ email, reason: mapped.suppress, note: `Brevo : ${ev.event}` })
        .onConflictDoNothing();
    }
    const messageId = ev["message-id"];
    if (!mapped.status || !messageId) return;
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: emailMessages.id, leadId: emailMessages.leadId, status: emailMessages.status })
        .from(emailMessages)
        .where(eq(emailMessages.providerMessageId, messageId))
        .for("update")
        .limit(1);
      const status = mapped.status;
      if (!row || !status || !advances(row.status, status)) return;
      await tx
        .update(emailMessages)
        .set({ status, updatedAt: new Date() })
        .where(eq(emailMessages.id, row.id));
      await tx
        .insert(leadEvents)
        .values({ leadId: row.leadId, type: "email_status", data: { from: row.status, to: status } });
    });
  }

  app.post<{ Params: { token: string } }>(
    "/webhooks/brevo/:token",
    { config: { rateLimit: { max: 1200, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const secret = config.BREVO_WEBHOOK_SECRET;
      // même réponse pour « non configuré » et « mauvais jeton » : rien à deviner
      if (!secret || !same(req.params.token, secret)) throw notFound();
      const items = Array.isArray(req.body) ? req.body : [req.body];
      for (const item of items) {
        const parsed = eventSchema.safeParse(item);
        if (parsed.success) await applyEvent(parsed.data);
      }
      return reply.code(200).send({ ok: true });
    },
  );

  const emailOf = (token: string) =>
    config.UNSUBSCRIBE_SECRET ? verifyUnsubscribe(token, config.UNSUBSCRIBE_SECRET) : null;

  // GET : simple confirmation (les antivirus de messagerie suivent les liens : un GET ne doit rien modifier).
  app.get<{ Params: { token: string } }>(
    "/unsubscribe/:token",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!emailOf(req.params.token)) {
        return reply
          .code(404)
          .type("text/html")
          .send(page("Lien invalide", "Ce lien de désinscription n'est pas valide."));
      }
      const form = `<form method="post" action=""><button type="submit">Me désinscrire</button></form>`;
      return reply
        .type("text/html")
        .send(page("Désinscription", "Confirmez que vous ne souhaitez plus recevoir nos messages.", form));
    },
  );

  app.post<{ Params: { token: string } }>(
    "/unsubscribe/:token",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const email = emailOf(req.params.token);
      if (!email)
        return reply
          .code(404)
          .type("text/html")
          .send(page("Lien invalide", "Ce lien de désinscription n'est pas valide."));
      await db
        .insert(suppressions)
        .values({ email, reason: "unsubscribe", note: "Lien de désinscription" })
        .onConflictDoNothing();
      // l'e-mail déjà envoyé à cette adresse passe en « Désinscrit », avec trace dans l'historique du lead
      const rows = await db
        .update(emailMessages)
        .set({ status: "Désinscrit", updatedAt: new Date() })
        .where(
          and(
            sql`${emailMessages.status} is not null`,
            sql`${emailMessages.leadId} in (select l.id from leads l join contacts c on c.id = l.contact_id where lower(c.email) = ${email})`,
          ),
        )
        .returning({ leadId: emailMessages.leadId });
      if (rows.length) {
        await db.insert(leadEvents).values(
          rows.map((r) => ({
            leadId: r.leadId,
            type: "email_status",
            data: { to: "Désinscrit", via: "lien" },
          })),
        );
      }
      return reply
        .type("text/html")
        .send(
          page(
            "Vous êtes désinscrit",
            "Votre adresse a été retirée de nos listes. Vous ne recevrez plus de message de notre part.",
          ),
        );
    },
  );
}
