import { type LeadListQuery, NONE } from "@gac/shared";
import { and, asc, desc, eq, ilike, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import { companies, contacts, emailMessages, leads } from "../../db/schema";

/** Échappe les caractères spéciaux de LIKE (\, % et _) : la recherche est une recherche de texte, pas un motif. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

const eqOrNone = <T>(column: Parameters<typeof eq>[0], value: T | typeof NONE): SQL =>
  value === NONE ? isNull(column) : eq(column, value);

/** Conditions SQL d'une recherche de leads (tous les filtres sont facultatifs et se cumulent). */
export type LeadFilter = Omit<LeadListQuery, "limit" | "offset" | "sort" | "order">;

export function leadFilters(f: LeadFilter): SQL | undefined {
  const where: SQL[] = [];
  if (f.q) {
    const pattern = likePattern(f.q);
    const digits = f.q.replace(/\D/g, "");
    // « 01 23 45 » doit retrouver +33123… : un 0 initial correspond à l'indicatif +33
    const phoneDigits = digits.startsWith("0") ? `33${digits.slice(1)}` : digits;
    const match = or(
      ilike(companies.name, pattern),
      ilike(companies.domain, pattern),
      ilike(contacts.email, pattern),
      ilike(sql`coalesce(${contacts.firstName}, '') || ' ' || coalesce(${contacts.lastName}, '')`, pattern),
      digits.length >= 4 ? ilike(companies.phone, likePattern(phoneDigits)) : undefined,
    );
    if (match) where.push(match);
  }
  if (f.qualification) where.push(eqOrNone(leads.qualification, f.qualification));
  if (f.stage) where.push(eqOrNone(leads.stage, f.stage));
  if (f.service) where.push(eq(leads.service, f.service));
  if (f.segment === "with_website") where.push(isNotNull(companies.domain));
  if (f.segment === "no_website") where.push(isNull(companies.domain));
  if (f.source) where.push(eq(leads.source, f.source));
  if (f.validation) where.push(eq(emailMessages.validation, f.validation));
  if (f.promptVersion) where.push(eq(emailMessages.promptVersion, f.promptVersion));
  if (f.emailStatus) where.push(eqOrNone(emailMessages.status, f.emailStatus));
  if (f.callState) where.push(eqOrNone(leads.callState, f.callState));
  if (f.callStatus) where.push(eqOrNone(leads.callStatus, f.callStatus));
  if (f.sector) where.push(sql`lower(${companies.sector}) = lower(${f.sector})`);
  if (f.city) where.push(ilike(companies.city, `${likePattern(f.city).slice(1)}`));
  if (f.hasPhone !== undefined) where.push(f.hasPhone ? isNotNull(companies.phone) : isNull(companies.phone));
  if (f.hasEmail !== undefined) where.push(f.hasEmail ? isNotNull(contacts.email) : isNull(contacts.email));
  return where.length ? and(...where) : undefined;
}

/** Tri : colonnes autorisées uniquement (liste blanche), valeurs absentes toujours en dernier, ordre stable. */
export function leadOrder(sort: LeadListQuery["sort"], order: LeadListQuery["order"]): SQL[] {
  const dir = order === "asc" ? asc : desc;
  const expression = {
    detectedAt: leads.detectedAt,
    company: sql`lower(${companies.name})`,
    // Chaud avant Tiède avant Froid, puis les non qualifiés
    qualification: sql`case ${leads.qualification} when 'Chaud' then 0 when 'Tiède' then 1 when 'Froid' then 2 end`,
    employees: companies.employees,
    rating: companies.googleRating,
    traffic: companies.organicTraffic,
    city: sql`lower(${companies.city})`,
    // nombre d'appels déjà passés : les prospects jamais appelés d'abord (avec « asc »)
    calls: sql`(${leads.callStatus} is not null)::int + (${leads.followup1} is not null)::int + (${leads.followup2} is not null)::int`,
  }[sort];
  // File d'appel : à nombre d'appels égal, regroupés par ville (déplacements, indicatif) puis par nom
  const tie =
    sort === "calls" ? [asc(sql`lower(${companies.city})`), asc(sql`lower(${companies.name})`)] : [];
  return [sql`${dir(expression)} nulls last`, ...tie, asc(leads.id)];
}
