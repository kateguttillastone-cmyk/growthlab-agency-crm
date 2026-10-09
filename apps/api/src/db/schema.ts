import {
  ADDRESS_CHECKS,
  CALL_STATES,
  CALL_STATUSES,
  EMAIL_STATUSES,
  PIPELINE_STAGES,
  QUALIFICATIONS,
  SERVICES,
  SUPPRESSION_REASONS,
  VALIDATION_STATUSES,
} from "@gac/shared";
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["ADMIN", "MANAGER", "AGENT", "VIEWER"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull().default("AGENT"),
    passwordHash: text("password_hash").notNull(),
    active: boolean("active").notNull().default(true),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

/** Session serveur : seul l'empreinte SHA-256 du jeton est stockée (le cookie contient le jeton). */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Expiration par inactivité (glissante). */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Expiration absolue. */
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [uniqueIndex("sessions_token_hash_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

/** Journal d'audit : qui a fait quoi, quand. Alimenté par l'API, jamais modifié. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    ip: text("ip"),
  },
  (t) => [index("audit_at_idx").on(t.at.desc()), index("audit_entity_idx").on(t.entityType, t.entityId)],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;

// ---------------------------------------------------------------------------
// Prospection (phase 2). Les valeurs des énumérations viennent du catalogue partagé (@gac/shared) : une seule
// définition pour la base, l'API et l'interface. Voir docs/06-modele-donnees.md.
// ---------------------------------------------------------------------------

export const qualification = pgEnum("qualification", QUALIFICATIONS);
export const pipelineStage = pgEnum("pipeline_stage", PIPELINE_STAGES);
export const callStatus = pgEnum("call_status", CALL_STATUSES);
export const callState = pgEnum("call_state", CALL_STATES);
export const leadService = pgEnum("lead_service", SERVICES);
export const validationStatus = pgEnum("validation_status", VALIDATION_STATUSES);
export const emailStatus = pgEnum("email_status", EMAIL_STATUSES);
export const addressCheck = pgEnum("address_check", ADDRESS_CHECKS);
export const suppressionReason = pgEnum("suppression_reason", SUPPRESSION_REASONS);

/**
 * Entreprise. Clé naturelle : le domaine du site ; à défaut (prospects sans site, issus de Google Maps), le nom
 * normalisé + le téléphone. Le téléphone seul NE suffit PAS (standards et franchises partagés : 9 cas sur 17
 * dans l'export analysé). Les colonnes booléennes d'enrichissement valent NULL tant que le site n'a pas été mesuré.
 */
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Nom en minuscules, sans accents ni ponctuation superflue : sert à la déduplication. */
    nameKey: text("name_key").notNull(),
    domain: text("domain"),
    website: text("website"),
    sector: text("sector"),
    employees: integer("employees"),
    foundedYear: integer("founded_year"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    region: text("region"),
    country: text("country").notNull().default("FR"),
    /** Numéro au format international (+33…). */
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    description: text("description"),
    // Google Maps
    googleCategory: text("google_category"),
    googleRating: numeric("google_rating", { precision: 2, scale: 1, mode: "number" }),
    googleReviews: integer("google_reviews"),
    googleMapsUrl: text("google_maps_url"),
    gps: text("gps"),
    // Enrichissement du site (BuiltWith / Semrush)
    organicTraffic: integer("organic_traffic"),
    domainAuthority: integer("domain_authority"),
    backlinks: integer("backlinks"),
    cms: text("cms"),
    isEcommerce: boolean("is_ecommerce"),
    hasGtm: boolean("has_gtm"),
    hasGa4: boolean("has_ga4"),
    hasMetaPixel: boolean("has_meta_pixel"),
    hasGoogleAds: boolean("has_google_ads"),
    hasSsl: boolean("has_ssl"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("companies_domain_uq").on(t.domain).where(sql`${t.domain} is not null`),
    uniqueIndex("companies_name_phone_uq")
      .on(t.nameKey, sql`coalesce(${t.phone}, '')`)
      .where(sql`${t.domain} is null`),
    index("companies_sector_idx").on(t.sector),
  ],
);

/** Personne jointe dans une entreprise (absente pour les prospects Google Maps : on n'a que le standard). */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    /** « prénom nom » normalisé : déduplication quand il n'y a pas d'e-mail. */
    nameKey: text("name_key").notNull().default(""),
    jobTitle: text("job_title"),
    /** Toujours en minuscules. */
    email: text("email"),
    /** Contrôle de l'adresse (syntaxe, domaine, adresse jetable) ; null = pas encore contrôlée. */
    emailCheck: addressCheck("email_check"),
    emailCheckedAt: timestamp("email_checked_at", { withTimezone: true }),
    linkedinUrl: text("linkedin_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contacts_email_uq").on(t.email).where(sql`${t.email} is not null`),
    uniqueIndex("contacts_company_name_uq").on(t.companyId, t.nameKey).where(sql`${t.email} is null`),
    index("contacts_company_idx").on(t.companyId),
  ],
);

/** Suivi commercial d'un contact (ou de l'entreprise seule, sans contact). Un seul lead par contact. */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** Origine du prospect (ex. « LinkedIn Lead Finder », « Google Maps - No Website Finder »). */
    source: text("source").notNull().default("Inconnue"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    /** NULL = « à qualifier ». */
    qualification: qualification("qualification"),
    qualificationReason: text("qualification_reason"),
    service: leadService("service"),
    /** Formulation d'origine (type de campagne, mise en place du tracking…), conservée telle quelle. */
    serviceDetail: text("service_detail"),
    stage: pipelineStage("stage"),
    dealValue: numeric("deal_value", { precision: 12, scale: 2, mode: "number" }),
    pack: text("pack"),
    callStatus: callStatus("call_status"),
    followup1: callStatus("followup_1"),
    followup2: callStatus("followup_2"),
    callState: callState("call_state"),
    comment: text("comment"),
    nextAction: text("next_action"),
    /** Empreinte stable de la ligne d'origine : rend l'import rejouable sans doublon. */
    importKey: text("import_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("leads_contact_uq").on(t.contactId).where(sql`${t.contactId} is not null`),
    uniqueIndex("leads_company_only_uq").on(t.companyId).where(sql`${t.contactId} is null`),
    uniqueIndex("leads_import_key_uq").on(t.importKey).where(sql`${t.importKey} is not null`),
    index("leads_detected_idx").on(t.detectedAt.desc()),
    index("leads_stage_idx").on(t.stage),
    index("leads_qualification_idx").on(t.qualification),
    index("leads_service_idx").on(t.service),
    index("leads_owner_idx").on(t.ownerId),
    check("leads_deal_value_check", sql`${t.dealValue} is null or ${t.dealValue} >= 0`),
  ],
);

/** E-mail de prospection d'un lead (un seul pour l'instant : `sequence_no` prépare les relances). */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    sequenceNo: integer("sequence_no").notNull().default(1),
    subject: text("subject"),
    body: text("body"),
    /** « Pas Validé » = en attente de relecture. */
    validation: validationStatus("validation").notNull().default("Pas Validé"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    /** Qui a validé : la personne qui relit répond du texte qui partira. */
    validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
    status: emailStatus("status"),
    /** Jour d'envoi (l'ancienne base ne conserve pas l'heure). */
    sentOn: date("sent_on", { mode: "string" }),
    /** Horodatage exact de l'envoi (l'ancienne base ne conserve que le jour). */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /**
     * Réservation d'envoi : posée avant l'appel au fournisseur, jamais retirée en cas de résultat incertain
     * (délai dépassé) : un e-mail ne part pas deux fois, même si le programme s'arrête en plein envoi.
     */
    sendingAt: timestamp("sending_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    sendFailures: integer("send_failures").notNull().default(0),
    sendError: text("send_error"),
    promptVersion: text("prompt_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_messages_lead_seq_uq").on(t.leadId, t.sequenceNo),
    index("email_messages_status_idx").on(t.status),
    index("email_messages_validation_idx").on(t.validation),
    index("email_messages_provider_id_idx").on(t.providerMessageId),
  ],
);

/** Réglages modifiables à chaud (ex. pause de l'envoi). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

/** Adresses auxquelles on n'écrit plus jamais (désinscription, rebond définitif, plainte). */
export const suppressions = pgTable("suppressions", {
  email: text("email").primaryKey(),
  reason: suppressionReason("reason").notNull(),
  note: text("note"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/** Historique des changements d'un lead (qui, quoi, quand) : base des indicateurs de délais et de conversion. */
export const leadEvents = pgTable(
  "lead_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_events_lead_idx").on(t.leadId, t.at.desc())],
);

export type CompanyRow = typeof companies.$inferSelect;
export type ContactRow = typeof contacts.$inferSelect;
export type LeadRow = typeof leads.$inferSelect;
