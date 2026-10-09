import type { LeadEvent } from "@gac/shared";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../../db/client";
import { companies, contacts, emailMessages, leadEvents, leads, suppressions, users } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { type JoinedRow, toDetail } from "./dto";

/** Lectures de lead partagées par les modules « leads » et « e-mails ». */
export function leadReader(db: Db) {
  const validator = alias(users, "validator");

  /** Lead, entreprise, contact, premier e-mail, motif d'exclusion et relecteur : la forme de base de toutes les lectures. */
  const joined = () =>
    db
      .select({
        lead: leads,
        company: companies,
        contact: contacts,
        message: emailMessages,
        blockedReason: suppressions.reason,
        validatorName: validator.name,
      })
      .from(leads)
      .innerJoin(companies, eq(companies.id, leads.companyId))
      .leftJoin(contacts, eq(contacts.id, leads.contactId))
      .leftJoin(emailMessages, sql`${emailMessages.leadId} = ${leads.id} and ${emailMessages.sequenceNo} = 1`)
      .leftJoin(suppressions, sql`${suppressions.email} = lower(${contacts.email})`)
      .leftJoin(validator, eq(validator.id, emailMessages.validatedBy));

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

  return { joined, detail };
}
