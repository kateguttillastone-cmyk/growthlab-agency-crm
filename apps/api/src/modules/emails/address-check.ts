import type { AddressCheck, AddressCheckResult } from "@gac/shared";
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { contacts, emailMessages, leadEvents, leads } from "../../db/schema";
import {
  checkDomain,
  checkLocally,
  type DnsResolver,
  splitAddress,
  systemResolver,
} from "../../mail/address-check";

/** Un contrôle reste valable un mois : un domaine peut disparaître, un serveur apparaître. */
const VALIDITY_DAYS = 30;
const CONCURRENCY = 10;

/** Contacts à contrôler : adresse présente, e-mail non envoyé et non rejeté, contrôle absent ou périmé. */
const dueCondition = () =>
  and(
    isNotNull(contacts.email),
    or(
      isNull(contacts.emailCheck),
      lt(contacts.emailCheckedAt, sql`now() - interval '${sql.raw(String(VALIDITY_DAYS))} days'`),
    ),
    sql`exists (select 1 from ${leads} l join ${emailMessages} m on m.lead_id = l.id and m.sequence_no = 1
      where l.contact_id = ${contacts.id} and m.status is null and m.sent_on is null and m.validation <> 'Rejeté')`,
  );

async function mapLimited<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

export async function countDue(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(dueCondition());
  return row?.n ?? 0;
}

/**
 * Contrôle jusqu'à `limit` adresses (syntaxe, adresse jetable, serveur de messagerie du domaine). Un résultat
 * inutilisable remet à relire les e-mails déjà validés de cette adresse, avec trace dans l'historique.
 */
export async function runAddressCheck(
  db: Db,
  opts: { limit: number; actorId: string; resolver?: DnsResolver },
): Promise<AddressCheckResult> {
  const due = await db
    .select({ id: contacts.id, email: contacts.email })
    .from(contacts)
    .where(dueCondition())
    .orderBy(contacts.createdAt, contacts.id)
    .limit(opts.limit);

  const domains = new Map<string, "valid" | "no_mail_server" | null>();
  const wanted = new Set<string>();
  for (const c of due) {
    const email = c.email ?? "";
    if (checkLocally(email)) continue;
    const parts = splitAddress(email);
    if (parts) wanted.add(parts.domain);
  }
  const resolver = opts.resolver ?? systemResolver;
  await mapLimited([...wanted], CONCURRENCY, async (d) => {
    domains.set(d, await checkDomain(d, resolver));
  });

  const result: AddressCheckResult = {
    checked: 0,
    valid: 0,
    invalid: {},
    indeterminate: 0,
    revoked: 0,
    remaining: 0,
  };
  const byOutcome = new Map<AddressCheck, string[]>();
  for (const c of due) {
    const email = c.email ?? "";
    const local = checkLocally(email);
    const outcome: AddressCheck | null = local ?? domains.get(splitAddress(email)?.domain ?? "") ?? null;
    if (!outcome) {
      result.indeterminate += 1;
      continue;
    }
    byOutcome.set(outcome, [...(byOutcome.get(outcome) ?? []), c.id]);
  }

  await db.transaction(async (tx) => {
    const now = new Date();
    for (const [outcome, ids] of byOutcome) {
      await tx
        .update(contacts)
        .set({ emailCheck: outcome, emailCheckedAt: now })
        .where(inArray(contacts.id, ids));
      result.checked += ids.length;
      if (outcome === "valid") {
        result.valid += ids.length;
        continue;
      }
      result.invalid[outcome] = ids.length;
      // Un e-mail déjà validé vers une adresse inutilisable repart en relecture.
      const revoked = await tx
        .update(emailMessages)
        .set({ validation: "Pas Validé", validatedAt: null, validatedBy: null, updatedAt: now })
        .where(
          and(
            eq(emailMessages.validation, "Validé"),
            isNull(emailMessages.status),
            isNull(emailMessages.sentOn),
            eq(emailMessages.sequenceNo, 1),
            inArray(
              emailMessages.leadId,
              tx.select({ id: leads.id }).from(leads).where(inArray(leads.contactId, ids)),
            ),
          ),
        )
        .returning({ leadId: emailMessages.leadId });
      if (revoked.length) {
        result.revoked += revoked.length;
        await tx.insert(leadEvents).values(
          revoked.map((r) => ({
            leadId: r.leadId,
            actorId: opts.actorId,
            type: "email_validation",
            data: { from: "Validé", to: "Pas Validé", reason: outcome },
          })),
        );
      }
    }
  });

  result.remaining = await countDue(db);
  return result;
}
