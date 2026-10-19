import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import type { Config } from "../../config";
import type { Db } from "../../db/client";
import { auditRequests, suppressions } from "../../db/schema";
import type { MailSender, OutgoingMail } from "../../mail/brevo";
import { mailIdentity } from "../../mail/identity";
import { renderEmail } from "../../mail/template";
import { effectiveConfig } from "../settings/effective";

type RequestRow = typeof auditRequests.$inferSelect;

/** Rebond et plainte bloquent tout envoi ; une désinscription ancienne n'empêche pas de répondre à une nouvelle demande. */
const BLOCKING = ["bounce", "complaint", "manual"] as const;

/** Remplace {entreprise} et {site} dans un texte réglable. */
export function fillPlaceholders(text: string, r: Pick<RequestRow, "companyName" | "website">): string {
  return text.replaceAll("{entreprise}", r.companyName).replaceAll("{site}", r.website);
}

/** E-mail d'accusé de réception : même gabarit sobre que la prospection, sans lien de désinscription (message de service). */
export function buildAck(config: Config, r: RequestRow, to: string, test: boolean): OutgoingMail {
  const id = {
    ...mailIdentity(config),
    optOutText: "Vous recevez cet e-mail parce que vous avez demandé un audit gratuit sur notre site.",
  };
  const msg = renderEmail(
    {
      subject: fillPlaceholders(config.MAIL_AUDIT_ACK_SUBJECT, r),
      body: fillPlaceholders(config.MAIL_AUDIT_ACK_BODY, r),
    },
    id,
  );
  return {
    to,
    from: { name: id.fromName, email: id.fromAddress },
    replyTo: { name: id.fromName, email: id.fromAddress },
    subject: test ? `[TEST] ${msg.subject}` : msg.subject,
    html: msg.html,
    text: msg.text,
    headers: {},
    tags: ["gac", "audit-ack"],
  };
}

/** Alerte interne : l'équipe voit tout de suite qui a écrit et quoi. */
export function buildNotification(config: Config, r: RequestRow, to: string, test: boolean): OutgoingMail {
  const id = mailIdentity(config);
  const lines = [
    `Nouvelle demande d'audit : ${r.companyName}`,
    `Site : ${r.website}`,
    `E-mail : ${r.email}`,
    `Téléphone : ${r.phone ?? "non renseigné"}`,
    `Objet : ${r.subject ?? "non renseigné"}`,
    "",
    r.message ?? "(pas de message)",
    "",
    `À traiter dans le CRM : ${config.APP_ORIGIN}/audit-requests`,
  ];
  const text = lines.join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return {
    to,
    from: { name: id.fromName, email: id.fromAddress },
    subject: `${test ? "[TEST] " : ""}Nouvelle demande d'audit : ${r.companyName}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${lines
      .map((l) => `<p>${esc(l) || "&nbsp;"}</p>`)
      .join("")}</div>`,
    text,
    headers: {},
    tags: ["gac", "audit-notify"],
  };
}

/**
 * Destinataire réel d'un message de service selon le mode du serveur : en « prod » c'est la vraie adresse ; sinon, si
 * un fournisseur et une adresse de test existent, le message part à l'adresse de test (jamais à un visiteur) ; sinon rien.
 */
function route(
  config: Config,
  sender: MailSender | null,
  real: string,
): { to: string; test: boolean } | null {
  if (!sender) return null;
  if (config.SEND_MODE === "prod") return { to: real, test: false };
  if (config.SEND_TEST_RECIPIENT) return { to: config.SEND_TEST_RECIPIENT, test: true };
  return null;
}

const inFlight = new Set<string>();

export interface AckDeps {
  db: Db;
  config: Config;
  sender: MailSender | null;
}

/**
 * Envoie l'accusé de réception (puis l'alerte à l'équipe) d'une demande et enregistre le résultat. Jamais d'exception :
 * une panne d'envoi se lit sur la demande, elle ne fait pas perdre la demande. Un résultat incertain n'est jamais rejoué
 * tout seul.
 */
export async function processNewRequest({ db, config: base, sender }: AckDeps, id: string): Promise<void> {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try {
    const config = await effectiveConfig(db, base);
    const [row] = await db.select().from(auditRequests).where(eq(auditRequests.id, id)).limit(1);
    if (!row) return;
    await sendAck({ db, config, sender }, row);
    await notifyTeam({ db, config, sender }, row);
  } catch {
    // l'état d'envoi est déjà enregistré par sendAck ; une erreur imprévue ne doit pas remonter à la requête du visiteur
  } finally {
    inFlight.delete(id);
  }
}

/** Au plus ce nombre de demandes d'une même adresse en 24 h reçoivent un accusé : évite d'écrire en rafale à un tiers. */
const MAX_ACK_PER_EMAIL_PER_DAY = 3;

export async function sendAck(
  { db, config, sender }: AckDeps,
  row: RequestRow,
  opts: { force?: boolean } = {},
): Promise<void> {
  const set = async (v: Partial<typeof auditRequests.$inferInsert>) => {
    await db
      .update(auditRequests)
      .set({ ...v, updatedAt: new Date() })
      .where(eq(auditRequests.id, row.id));
  };
  const [blocked] = await db
    .select({ reason: suppressions.reason })
    .from(suppressions)
    .where(and(eq(suppressions.email, row.email), inArray(suppressions.reason, [...BLOCKING])))
    .limit(1);
  if (blocked) {
    await set({ ackStatus: "skipped", ackError: "Adresse exclue : aucun e-mail envoyé" });
    return;
  }
  // Quelqu'un peut saisir l'adresse d'un tiers : au-delà de quelques demandes par jour, plus d'accusé automatique.
  if (!opts.force) {
    const [same] = await db
      .select({ n: count() })
      .from(auditRequests)
      .where(
        and(
          eq(auditRequests.email, row.email),
          gte(auditRequests.createdAt, sql`now() - interval '24 hours'`),
        ),
      );
    if ((same?.n ?? 0) > MAX_ACK_PER_EMAIL_PER_DAY) {
      await set({
        ackStatus: "skipped",
        ackError:
          "Trop de demandes avec cette adresse en 24 h : accusé non envoyé (à renvoyer à la main si besoin)",
      });
      return;
    }
  }
  const dest = route(config, sender, row.email);
  if (!dest || !sender) {
    await set({
      ackStatus: "skipped",
      ackError: "Envoi désactivé sur ce serveur : l'accusé n'est pas parti",
    });
    return;
  }
  const result = await sender.send(buildAck(config, row, dest.to, dest.test));
  if (result.kind === "sent") {
    await set(
      dest.test
        ? {
            ackStatus: "skipped",
            ackMessageId: result.messageId,
            ackError: "Mode test : l'accusé est parti à l'adresse de test, pas au visiteur",
          }
        : { ackStatus: "sent", ackSentAt: new Date(), ackMessageId: result.messageId, ackError: null },
    );
    return;
  }
  await set({
    ackStatus: "failed",
    ackError: result.kind === "uncertain" ? `Résultat incertain : ${result.reason}` : result.reason,
  });
}

export async function notifyTeam({ db, config, sender }: AckDeps, row: RequestRow): Promise<void> {
  if (!config.AUDIT_NOTIFY_EMAIL) return;
  const dest = route(config, sender, config.AUDIT_NOTIFY_EMAIL);
  if (!dest || !sender) return;
  const result = await sender.send(buildNotification(config, row, dest.to, dest.test));
  if (result.kind === "sent") {
    await db.update(auditRequests).set({ notifiedAt: new Date() }).where(eq(auditRequests.id, row.id));
  }
}
