import type { SendStatus } from "@gac/shared";
import { eq, sql } from "drizzle-orm";
import type { Config } from "../../config";
import type { Db } from "../../db/client";
import { leadEvents, settings } from "../../db/schema";
import type { MailSender, OutgoingMail } from "../../mail/brevo";
import { mailIdentity } from "../../mail/identity";
import { inSlot, nextSlotStart, parseSlots } from "../../mail/slots";
import { renderEmail } from "../../mail/template";
import { signUnsubscribe } from "../../mail/unsubscribe-token";

/** Après ce nombre de refus définitifs du fournisseur, l'e-mail n'est plus tenté (à corriger par une personne). */
export const MAX_SEND_FAILURES = 3;

export async function isPaused(db: Db): Promise<boolean> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "sending_paused")).limit(1);
  return row?.value === true;
}

export async function setPaused(db: Db, paused: boolean, actorId: string | null): Promise<void> {
  await db
    .insert(settings)
    .values({ key: "sending_paused", value: paused, updatedBy: actorId })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: paused, updatedAt: new Date(), updatedBy: actorId },
    });
}

const TODAY_PARIS = sql`(date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')`;

/** Conditions d'un e-mail prêt à partir (adresse contrôlée valable, non exclue, texte présent, non réservé). */
const READY = sql`m.sequence_no = 1 and m.validation = 'Validé' and m.status is null and m.sent_on is null
  and m.sending_at is null and m.send_failures < ${MAX_SEND_FAILURES}
  and c.email is not null and c.email_check = 'valid'
  and not exists (select 1 from suppressions s where s.email = lower(c.email))
  and coalesce(trim(m.subject), '') <> '' and coalesce(trim(m.body), '') <> ''`;

export function buildOutgoing(
  config: Config,
  mail: { to: string; subject: string; body: string; promptVersion: string | null },
  opts: { test?: boolean } = {},
): OutgoingMail {
  const id = mailIdentity(config);
  const msg = renderEmail({ subject: mail.subject, body: mail.body }, id);
  const headers: Record<string, string> = {};
  if (config.UNSUBSCRIBE_SECRET && !opts.test) {
    const token = signUnsubscribe(mail.to, config.UNSUBSCRIBE_SECRET);
    headers["List-Unsubscribe"] =
      `<mailto:${id.fromAddress}?subject=stop>, <${config.APP_ORIGIN}/api/unsubscribe/${token}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return {
    to: mail.to,
    from: { name: id.fromName, email: id.fromAddress },
    replyTo: { name: id.fromName, email: id.fromAddress },
    subject: opts.test ? `[TEST] ${msg.subject}` : msg.subject,
    html: msg.html,
    text: msg.text,
    headers,
    tags: ["gac", ...(mail.promptVersion ? [`prompt:${mail.promptVersion}`.slice(0, 60)] : [])],
  };
}

interface Claimed extends Record<string, unknown> {
  id: string;
  lead_id: string;
  subject: string;
  body: string;
  prompt_version: string | null;
  email: string;
}

export type TickOutcome =
  | { kind: "idle"; reason: string }
  | { kind: "sent"; leadId: string }
  | { kind: "rejected"; leadId: string; permanent: boolean }
  | { kind: "uncertain"; leadId: string };

interface Deps {
  db: Db;
  config: Config;
  sender: MailSender | null;
  now?: () => Date;
}

/**
 * Un pas d'envoi : au plus UN e-mail. Les garde-fous, dans l'ordre : mode « prod », pas en pause, créneau ouvert,
 * plafond du jour, délai minimal depuis le dernier envoi. L'e-mail est RÉSERVÉ (`sending_at`) en base avant tout appel
 * au fournisseur ; la réservation est atomique (SKIP LOCKED), donc plusieurs exécutions simultanées ne peuvent jamais
 * choisir le même message. Un résultat incertain garde la réservation : aucun renvoi automatique.
 */
export async function sendTick({ db, config, sender, now = () => new Date() }: Deps): Promise<TickOutcome> {
  if (config.SEND_MODE !== "prod" || !sender) return { kind: "idle", reason: "envoi désactivé" };
  if (await isPaused(db)) return { kind: "idle", reason: "en pause" };
  if (!inSlot(now(), parseSlots(config.SEND_SLOTS), config.SEND_WINDOW_MINUTES)) {
    return { kind: "idle", reason: "hors créneau" };
  }

  // Garde-fous et réservation dans UNE transaction sérialisée : même avec plusieurs exécutions simultanées, le délai
  // et le plafond sont vérifiés sur l'état réel, et deux exécutions ne réservent jamais le même e-mail.
  const claim = await db.transaction(async (tx): Promise<{ idle: string } | { row: Claimed }> => {
    await tx.execute(sql`select pg_advisory_xact_lock(727275)`);
    const { rows: gate } = await tx.execute<{ today: string; since_last: string | null }>(sql`
      select count(*) filter (where greatest(sent_at, sending_at) >= ${TODAY_PARIS})::text as today,
             extract(epoch from (now() - max(greatest(sent_at, sending_at))))::text as since_last
      from email_messages`);
    if (Number(gate[0]?.today ?? 0) >= config.SEND_DAILY_CAP) return { idle: "plafond du jour atteint" };
    const sinceLast = gate[0]?.since_last;
    if (sinceLast !== null && sinceLast !== undefined && Number(sinceLast) < config.SEND_INTERVAL_SECONDS) {
      return { idle: "délai entre deux envois" };
    }
    const { rows } = await tx.execute<Claimed>(sql`
      with pick as (
        select m.id from email_messages m
        join leads l on l.id = m.lead_id
        join contacts c on c.id = l.contact_id
        where ${READY}
        order by (l.qualification = 'Chaud') desc nulls last, m.validated_at nulls last, m.id
        for update of m skip locked
        limit 1)
      update email_messages m set sending_at = now()
      from pick, leads l, contacts c
      where m.id = pick.id and l.id = m.lead_id and c.id = l.contact_id
      returning m.id, m.lead_id, m.subject, m.body, m.prompt_version, c.email`);
    const row = rows[0];
    return row ? { row } : { idle: "rien à envoyer" };
  });
  if ("idle" in claim) return { kind: "idle", reason: claim.idle };
  const claimed = claim.row;

  const result = await sender.send(
    buildOutgoing(config, {
      to: claimed.email,
      subject: claimed.subject,
      body: claimed.body,
      promptVersion: claimed.prompt_version,
    }),
  );

  if (result.kind === "sent") {
    await db.transaction(async (tx) => {
      await tx.execute(sql`update email_messages set status = 'Envoyé', sent_at = now(),
        sent_on = (now() at time zone 'Europe/Paris')::date, provider_message_id = ${result.messageId}, send_error = null
        where id = ${claimed.id}`);
      await tx
        .insert(leadEvents)
        .values({ leadId: claimed.lead_id, type: "email_sent", data: { sequence: 1 } });
    });
    return { kind: "sent", leadId: claimed.lead_id };
  }
  if (result.kind === "rejected") {
    await db.execute(sql`update email_messages set sending_at = null, send_error = ${result.reason},
      send_failures = send_failures + ${result.permanent ? 1 : 0} where id = ${claimed.id}`);
    await db.insert(leadEvents).values({
      leadId: claimed.lead_id,
      type: "email_send_failed",
      data: { reason: result.reason, permanent: result.permanent },
    });
    return { kind: "rejected", leadId: claimed.lead_id, permanent: result.permanent };
  }
  await db.execute(
    sql`update email_messages set send_error = ${`incertain : ${result.reason}`} where id = ${claimed.id}`,
  );
  await db
    .insert(leadEvents)
    .values({ leadId: claimed.lead_id, type: "email_send_uncertain", data: { reason: result.reason } });
  return { kind: "uncertain", leadId: claimed.lead_id };
}

export async function sendStatus(db: Db, config: Config, now: Date = new Date()): Promise<SendStatus> {
  const { rows } = await db.execute<{
    sent_today: string;
    ready: string;
    blocked: string;
    uncertain: string;
  }>(sql`
    select
      count(*) filter (where m.sent_at >= ${TODAY_PARIS})::text as sent_today,
      count(*) filter (where ${READY})::text as ready,
      count(*) filter (where m.sequence_no = 1 and m.validation = 'Validé' and m.status is null and m.sent_on is null
        and m.sending_at is null and not coalesce((${READY}), false))::text as blocked,
      count(*) filter (where m.sending_at is not null and m.status is null)::text as uncertain
    from email_messages m
    join leads l on l.id = m.lead_id
    left join contacts c on c.id = l.contact_id`);
  const x = rows[0];
  const slots = parseSlots(config.SEND_SLOTS);
  return {
    mode: config.SEND_MODE,
    configured: Boolean(config.BREVO_API_KEY && config.BREVO_WEBHOOK_SECRET && config.UNSUBSCRIBE_SECRET),
    paused: await isPaused(db),
    testRecipient: config.SEND_TEST_RECIPIENT ?? null,
    from: `${config.MAIL_FROM_NAME} <${config.MAIL_FROM_ADDRESS}>`,
    dailyCap: config.SEND_DAILY_CAP,
    intervalSeconds: config.SEND_INTERVAL_SECONDS,
    slots: config.SEND_SLOTS,
    windowMinutes: config.SEND_WINDOW_MINUTES,
    sentToday: Number(x?.sent_today ?? 0),
    ready: Number(x?.ready ?? 0),
    blocked: Number(x?.blocked ?? 0),
    uncertain: Number(x?.uncertain ?? 0),
    slotOpen: inSlot(now, slots, config.SEND_WINDOW_MINUTES),
    nextSlot: nextSlotStart(now, slots)?.toISOString() ?? null,
  };
}
