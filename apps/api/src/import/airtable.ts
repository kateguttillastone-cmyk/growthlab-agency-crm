import {
  CALL_STATES,
  CALL_STATUSES,
  EMAIL_STATUSES,
  PIPELINE_STAGES,
  QUALIFICATIONS,
  VALIDATION_STATUSES,
} from "@gac/shared";
import { parse } from "csv-parse/sync";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  type CompanyRow,
  companies,
  contacts,
  emailMessages,
  leadEvents,
  leads,
  suppressions,
  users,
} from "../db/schema";
import { one } from "../lib/assert";
import {
  cleanBlock,
  cleanText,
  extractCityAndPostalCode,
  leadImportKey,
  nameKey,
  normalizeCountry,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizeService,
  parseCheckbox,
  parseDecimal,
  parseFrDate,
  parseFrDateTime,
  parseInteger,
  parseIsoDate,
} from "./normalize";

export interface ImportOptions {
  /** Tout est exécuté puis annulé : rien n'est écrit. */
  dryRun?: boolean;
  /** Fuseau de la base d'origine pour les dates sans fuseau (« 24/9/2026 3:05pm »). L'export analysé porte -04:00. */
  timezoneOffset?: string;
}

export interface ImportReport {
  dryRun: boolean;
  rows: number;
  skipped: number;
  companies: { created: number; existing: number };
  contacts: { created: number; existing: number };
  leads: { created: number; existing: number };
  emailMessages: { created: number; existing: number };
  suppressions: { created: number; existing: number };
  /** Anomalies par type, avec le nombre de lignes concernées (aucune donnée personnelle). */
  warnings: Record<string, number>;
}

type Row = Record<string, string>;

const inList = <T extends readonly string[]>(list: T, value: string | null): T[number] | null =>
  value !== null && (list as readonly string[]).includes(value) ? (value as T[number]) : null;

/** Note laissée par l'automatisation lors d'une panne de crédit : sans objet dès que le corps de l'e-mail existe. */
const STALE_NOTE = /email vide suite/i;

export async function importAirtableCsv(
  db: Db,
  csv: string,
  opts: ImportOptions = {},
): Promise<ImportReport> {
  const offset = opts.timezoneOffset ?? "-04:00";
  const records = parse(csv, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false,
    trim: false,
  }) as Row[];

  const report: ImportReport = {
    dryRun: !!opts.dryRun,
    rows: records.length,
    skipped: 0,
    companies: { created: 0, existing: 0 },
    contacts: { created: 0, existing: 0 },
    leads: { created: 0, existing: 0 },
    emailMessages: { created: 0, existing: 0 },
    suppressions: { created: 0, existing: 0 },
    warnings: {},
  };
  const warn = (type: string) => {
    report.warnings[type] = (report.warnings[type] ?? 0) + 1;
  };
  const get = (row: Row, col: string) => row[col] ?? "";

  class Rollback extends Error {}

  try {
    await db.transaction(async (tx) => {
      const userRows = await tx.select({ id: users.id, name: users.name, email: users.email }).from(users);
      const seenLeadKeys = new Set<string>();

      for (const row of records) {
        // --- ligne vide ou inexploitable
        const companyName = cleanText(get(row, "Entreprise"));
        if (Object.values(row).every((v) => cleanText(v) === null)) {
          report.skipped += 1;
          warn("ligne vide ignorée");
          continue;
        }
        if (!companyName) {
          report.skipped += 1;
          warn("ligne sans entreprise ignorée");
          continue;
        }

        // --- entreprise
        const website = cleanText(get(row, "Site web"));
        const domain = normalizeDomain(website);
        if (website && !domain) warn("site web illisible");
        const phone = normalizePhone(get(row, "Téléphone"));
        if (cleanText(get(row, "Téléphone")) && !phone) warn("téléphone non reconnu");
        const measured = cleanText(get(row, "Trafic organique")) !== null;
        const employeesRaw = cleanText(get(row, "Taille"));
        const employees = parseInteger(employeesRaw);
        if (employeesRaw && employees === null) warn("effectif non numérique");

        const address = cleanText(get(row, "Adresse complète Entreprise"));
        const derived = extractCityAndPostalCode(address);
        const cityRaw = cleanText(get(row, "Ville"));
        if (!cityRaw && derived.city) warn("ville déduite de l'adresse");

        const companyValues = {
          name: companyName,
          nameKey: nameKey(companyName),
          domain,
          website,
          sector: cleanText(get(row, "Secteur")),
          employees,
          foundedYear: parseInteger(get(row, "Année de création")),
          address,
          city: cityRaw ?? derived.city,
          postalCode: derived.postalCode,
          region: cleanText(get(row, "Etat")),
          country: normalizeCountry(get(row, "Pays")),
          phone,
          linkedinUrl: cleanText(get(row, "Linkedin Entreprise")),
          description: cleanBlock(get(row, "Description entreprise")),
          googleCategory: cleanText(get(row, "Categorie Google Maps")),
          googleRating: parseDecimal(get(row, "Note Google")),
          googleReviews: parseInteger(get(row, "Nombre avis Google")),
          googleMapsUrl: cleanText(get(row, "Fiche Google My Business")),
          gps: cleanText(get(row, "Coordonnees GPS")),
          organicTraffic: parseInteger(get(row, "Trafic organique")),
          domainAuthority: parseInteger(get(row, "Autorité domaine")),
          backlinks: parseInteger(get(row, "Backlinks")),
          cms: cleanText(get(row, "CMS")),
          isEcommerce: parseCheckbox(get(row, "E-commerce"), measured),
          hasGtm: parseCheckbox(get(row, "Tracking GTM"), measured),
          hasGa4: parseCheckbox(get(row, "Tracking GA4"), measured),
          hasMetaPixel: parseCheckbox(get(row, "Pixel Meta"), measured),
          hasGoogleAds: parseCheckbox(get(row, "Signal Google Ads"), measured),
          hasSsl: parseCheckbox(get(row, "SSL"), measured),
        };

        // Clé naturelle : le domaine ; à défaut nom + téléphone (le téléphone seul ne suffit pas : standards partagés).
        const found = domain
          ? await tx.select().from(companies).where(eq(companies.domain, domain)).limit(1)
          : await tx
              .select()
              .from(companies)
              .where(
                and(
                  isNull(companies.domain),
                  eq(companies.nameKey, companyValues.nameKey),
                  sql`coalesce(${companies.phone}, '') = ${phone ?? ""}`,
                ),
              )
              .limit(1);
        let company: CompanyRow;
        if (found[0]) {
          company = found[0];
          report.companies.existing += 1;
        } else {
          company = one(await tx.insert(companies).values(companyValues).returning());
          report.companies.created += 1;
        }

        // --- contact (absent pour les prospects Google Maps : on n'a que le standard de l'entreprise)
        const email = normalizeEmail(get(row, "Email"));
        if (cleanText(get(row, "Email")) && !email) warn("e-mail invalide");
        const firstName = cleanText(get(row, "Prénom"));
        const lastName = cleanText(get(row, "Nom"));
        const personKey = nameKey(`${firstName ?? ""} ${lastName ?? ""}`);
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
          if (existing[0]) {
            contactId = existing[0].id;
            report.contacts.existing += 1;
          } else {
            const [created] = await tx
              .insert(contacts)
              .values({
                companyId: company.id,
                firstName,
                lastName,
                nameKey: personKey,
                jobTitle: cleanText(get(row, "Poste")),
                email,
                linkedinUrl: cleanText(get(row, "Linkedin")),
              })
              .returning({ id: contacts.id });
            contactId = created?.id ?? null;
            report.contacts.created += 1;
          }
        }

        // --- lead : un seul par contact (ou par entreprise quand il n'y a pas de contact)
        const importKey = leadImportKey([email, domain, companyValues.nameKey, phone, personKey]);
        if (seenLeadKeys.has(importKey)) {
          report.skipped += 1;
          warn("doublon de ligne fusionné");
          continue;
        }
        seenLeadKeys.add(importKey);

        const existingLead = contactId
          ? await tx.select({ id: leads.id }).from(leads).where(eq(leads.contactId, contactId)).limit(1)
          : await tx
              .select({ id: leads.id })
              .from(leads)
              .where(and(eq(leads.companyId, company.id), isNull(leads.contactId)))
              .limit(1);
        if (existingLead[0]) {
          report.leads.existing += 1;
          continue; // jamais d'écrasement : après l'import, l'application est la référence
        }

        const qualificationRaw = cleanText(get(row, "Qualification"));
        const qualification = inList(QUALIFICATIONS, qualificationRaw);
        if (qualificationRaw && !qualification && !/^à qualifier/i.test(qualificationRaw))
          warn("qualification inconnue");
        const service = normalizeService(get(row, "Service recommandé"), !!domain);
        if (cleanText(get(row, "Service recommandé")) && !service.service) warn("service inconnu");

        const stageRaw = cleanText(get(row, "Étape pipeline"));
        const stage = inList(PIPELINE_STAGES, stageRaw);
        if (stageRaw && !stage) warn("étape de pipeline inconnue");
        const call = (col: string) => {
          const raw = cleanText(get(row, col));
          const v = inList(CALL_STATUSES, raw);
          if (raw && !v) warn(`valeur inconnue (${col})`);
          return v;
        };
        const callStateRaw = cleanText(get(row, "Statut appel"));
        const callState = inList(CALL_STATES, callStateRaw);
        if (callStateRaw && !callState) warn("statut d'appel inconnu");

        const body = cleanBlock(get(row, "Email corps"));
        let nextAction =
          cleanText(get(row, "Prochaine action Kate")) ?? cleanText(get(row, "Prochaine action Ifaliana"));
        if (nextAction && STALE_NOTE.test(nextAction) && body) {
          nextAction = null;
          warn("note obsolète ignorée (l'e-mail existe)");
        }

        const ownerName = cleanText(get(row, "Responsable"));
        let ownerId: string | null = null;
        if (ownerName) {
          const k = nameKey(ownerName);
          ownerId =
            userRows.find((u) => nameKey(u.name) === k || u.email.toLowerCase() === ownerName.toLowerCase())
              ?.id ?? null;
          if (!ownerId) warn("responsable sans compte correspondant");
        }

        const dealRaw = cleanText(get(row, "Valeur deal"));
        const dealValue = parseDecimal(dealRaw);
        if (dealRaw && dealValue === null) warn("valeur de deal illisible");

        const detectedAt = parseIsoDate(get(row, "Date détection"));
        if (cleanText(get(row, "Date détection")) && !detectedAt) warn("date de détection illisible");

        const lead = one(
          await tx
            .insert(leads)
            .values({
              companyId: company.id,
              contactId,
              ownerId,
              source: cleanText(get(row, "Source")) ?? "Inconnue",
              detectedAt: detectedAt ?? new Date(),
              qualification,
              qualificationReason: cleanBlock(get(row, "Raison")),
              service: service.service,
              serviceDetail: service.detail,
              stage,
              dealValue,
              pack: cleanText(get(row, "Pack")),
              callStatus: call("STATUT"),
              followup1: call("RELANCE 1"),
              followup2: call("RELANCE 2"),
              callState,
              comment: cleanBlock(get(row, "COMMENTAIRE")),
              nextAction,
              importKey,
            })
            .returning({ id: leads.id }),
        );
        report.leads.created += 1;
        await tx
          .insert(leadEvents)
          .values({ leadId: lead.id, type: "imported", data: { origin: "airtable-csv" } });

        // --- e-mail de prospection
        const subject = cleanText(get(row, "Email objet"));
        const statusRaw = cleanText(get(row, "Statut email"));
        const status = inList(EMAIL_STATUSES, statusRaw);
        if (statusRaw && !status) warn("statut d'e-mail inconnu");
        const validationRaw = cleanText(get(row, "Validation mail"));
        const validation = inList(VALIDATION_STATUSES, validationRaw) ?? "Pas Validé";
        if (validationRaw && !inList(VALIDATION_STATUSES, validationRaw))
          warn("validation d'e-mail inconnue");
        if (validation === "Validé" && !email) warn("e-mail validé mais sans adresse");
        if (subject || body || status || validationRaw) {
          const sentOnRaw = cleanText(get(row, "Email envoyé le"));
          const sentOn = parseFrDate(sentOnRaw);
          if (sentOnRaw && !sentOn) warn("date d'envoi illisible");
          const validatedRaw = cleanText(get(row, "Derniere validation"));
          const validatedAt = parseFrDateTime(validatedRaw, offset);
          if (validatedRaw && !validatedAt) warn("date de validation illisible");
          await tx.insert(emailMessages).values({
            leadId: lead.id,
            subject,
            body,
            validation,
            validatedAt,
            status,
            sentOn,
            promptVersion: cleanText(get(row, "Version_prompt_email")),
          });
          report.emailMessages.created += 1;
        }

        // --- adresses à ne plus jamais contacter
        if (email && (status === "Bounce" || status === "Désinscrit")) {
          const inserted = await tx
            .insert(suppressions)
            .values({
              email,
              reason: status === "Bounce" ? "bounce" : "unsubscribe",
              note: "Import de l'ancienne base",
            })
            .onConflictDoNothing()
            .returning({ email: suppressions.email });
          if (inserted.length) report.suppressions.created += 1;
          else report.suppressions.existing += 1;
        }
      }

      if (opts.dryRun) throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return report;
}

export function formatReport(r: ImportReport): string {
  const lines = [
    `${r.dryRun ? "SIMULATION (rien n'est écrit)" : "Import terminé"} — ${r.rows} lignes lues, ${r.skipped} ignorées`,
    `  entreprises : ${r.companies.created} créées, ${r.companies.existing} déjà présentes`,
    `  contacts    : ${r.contacts.created} créés, ${r.contacts.existing} déjà présents`,
    `  leads       : ${r.leads.created} créés, ${r.leads.existing} déjà présents`,
    `  e-mails     : ${r.emailMessages.created} créés`,
    `  à ne plus contacter : ${r.suppressions.created} ajoutées (rebonds et désinscriptions)`,
  ];
  const w = Object.entries(r.warnings).sort((a, b) => b[1] - a[1]);
  if (w.length) {
    lines.push("  anomalies :");
    for (const [k, n] of w) lines.push(`    - ${k} : ${n}`);
  }
  return lines.join("\n");
}
