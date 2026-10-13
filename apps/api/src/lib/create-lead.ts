import type { CreateLeadInput } from "@gac/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { companies, contacts, leadEvents, leads } from "../db/schema";
import { cleanText, nameKey, normalizeDomain, normalizeEmail, normalizePhone } from "../import/normalize";
import { AppError } from "./errors";

/** Champs que seule une source automatique (sourcing) connaît, en plus de la saisie manuelle. */
export interface NewLeadExtras {
  address?: string | null;
  postalCode?: string | null;
  employees?: number | null;
  googleCategory?: string | null;
  googleRating?: number | null;
  googleReviews?: number | null;
  googleMapsUrl?: string | null;
  linkedinUrl?: string | null;
}

export interface NewLeadContext {
  actorId: string | null;
  /** Origine du prospect : « Saisie manuelle », « Sourcing · Google Maps »… */
  source: string;
  /** Données jointes à l'événement « created » (qui l'a créé, quelle recherche). */
  eventData: Record<string, unknown>;
}

const invalid = (message: string) => new AppError(400, "VALIDATION_ERROR", message);

/**
 * Crée entreprise, contact et lead à l'étape « Nouveau », sans jamais dupliquer : une entreprise connue (même site, ou même
 * nom sans site) est réutilisée, un contact connu aussi ; un lead déjà présent lève un 409 avec son identifiant.
 * Un prospect avec un numéro entre aussitôt dans la file d'appel.
 */
export async function createLead(
  db: Db,
  b: CreateLeadInput & NewLeadExtras,
  ctx: NewLeadContext,
): Promise<string> {
  const companyKey = nameKey(b.companyName);
  if (!companyKey) throw invalid("Nom d'entreprise invalide");
  const website = cleanText(b.website);
  const domain = normalizeDomain(website);
  if (website && !domain) throw invalid("Site web illisible");
  const phone = normalizePhone(b.phone);
  if (cleanText(b.phone) && !phone) throw invalid("Téléphone non reconnu");
  const email = normalizeEmail(b.email);
  if (cleanText(b.email) && !email) throw invalid("Adresse e-mail invalide");
  const firstName = cleanText(b.firstName);
  const lastName = cleanText(b.lastName);
  const personKey = nameKey(`${firstName ?? ""} ${lastName ?? ""}`);

  return db.transaction(async (tx) => {
    const found = domain
      ? await tx.select().from(companies).where(eq(companies.domain, domain)).limit(1)
      : await tx
          .select()
          .from(companies)
          .where(
            and(
              isNull(companies.domain),
              eq(companies.nameKey, companyKey),
              sql`coalesce(${companies.phone}, '') = ${phone ?? ""}`,
            ),
          )
          .limit(1);
    const company =
      found[0] ??
      (
        await tx
          .insert(companies)
          .values({
            name: cleanText(b.companyName) ?? b.companyName,
            nameKey: companyKey,
            domain,
            website,
            sector: cleanText(b.sector),
            city: cleanText(b.city),
            phone,
            address: cleanText(b.address),
            postalCode: cleanText(b.postalCode),
            employees: b.employees ?? null,
            googleCategory: cleanText(b.googleCategory),
            googleRating: b.googleRating ?? null,
            googleReviews: b.googleReviews ?? null,
            googleMapsUrl: cleanText(b.googleMapsUrl),
            linkedinUrl: cleanText(b.linkedinUrl),
          })
          .returning()
      )[0];
    if (!company) throw new AppError(500, "INTERNAL_ERROR", "Création impossible");

    let contactId: string | null = null;
    if (email || personKey) {
      const existing = email
        ? await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.email, email)).limit(1)
        : await tx
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.companyId, company.id),
                eq(contacts.nameKey, personKey),
                isNull(contacts.email),
              ),
            )
            .limit(1);
      contactId =
        existing[0]?.id ??
        (
          await tx
            .insert(contacts)
            .values({
              companyId: company.id,
              firstName,
              lastName,
              nameKey: personKey,
              jobTitle: cleanText(b.jobTitle),
              email,
            })
            .returning({ id: contacts.id })
        )[0]?.id ??
        null;
    }

    const duplicate = contactId
      ? await tx.select({ id: leads.id }).from(leads).where(eq(leads.contactId, contactId)).limit(1)
      : await tx
          .select({ id: leads.id })
          .from(leads)
          .where(and(eq(leads.companyId, company.id), isNull(leads.contactId)))
          .limit(1);
    if (duplicate[0]) {
      throw new AppError(409, "CONFLICT", "Ce prospect existe déjà", { leadId: duplicate[0].id });
    }

    const [lead] = await tx
      .insert(leads)
      .values({
        companyId: company.id,
        contactId,
        source: ctx.source,
        stage: "Nouveau",
        callState: phone ? "À appeler" : null,
        qualification: b.qualification ?? null,
        service: b.service ?? null,
        comment: cleanText(b.comment),
      })
      .returning({ id: leads.id });
    if (!lead) throw new AppError(500, "INTERNAL_ERROR", "Création impossible");
    await tx
      .insert(leadEvents)
      .values({ leadId: lead.id, actorId: ctx.actorId, type: "created", data: ctx.eventData });
    return lead.id;
  });
}
