import { z } from "zod";
import {
  ADDRESS_CHECKS,
  CALL_STATES,
  CALL_STATUSES,
  EMAIL_STATUSES,
  PIPELINE_STAGES,
  QUALIFICATIONS,
  SEGMENTS,
  SERVICES,
  SUPPRESSION_REASONS,
  VALIDATION_STATUSES,
} from "./catalog";
import { MAX_PAGE_SIZE } from "./pagination";
import type { Role } from "./roles";

export const LEAD_SORT_KEYS = [
  "detectedAt",
  "company",
  "qualification",
  "employees",
  "rating",
  "traffic",
  "city",
  "calls",
] as const;

/** Valeur de filtre « aucune valeur » (ex. qualification vide). */
export const NONE = "none";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const withNone = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum([...values, NONE] as [string, ...string[]]);

export const leadListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(LEAD_SORT_KEYS).default("detectedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  qualification: withNone(QUALIFICATIONS).optional(),
  stage: withNone(PIPELINE_STAGES).optional(),
  service: z.enum(SERVICES).optional(),
  segment: z.enum(SEGMENTS).optional(),
  source: z.string().trim().max(100).optional(),
  validation: z.enum(VALIDATION_STATUSES).optional(),
  emailStatus: withNone(EMAIL_STATUSES).optional(),
  callState: withNone(CALL_STATES).optional(),
  callStatus: withNone(CALL_STATUSES).optional(),
  sector: z.string().trim().max(100).optional(),
  promptVersion: z.string().trim().max(100).optional(),
  /** Début du nom de la ville (sans tenir compte de la casse). */
  city: z.string().trim().max(100).optional(),
  hasPhone: bool.optional(),
  hasEmail: bool.optional(),
  /** Identifiant d'un responsable, ou « none » (sans responsable). */
  owner: z.union([z.uuid(), z.literal(NONE)]).optional(),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

const companySummary = z.object({
  id: z.uuid(),
  name: z.string(),
  domain: z.string().nullable(),
  website: z.string().nullable(),
  sector: z.string().nullable(),
  employees: z.number().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  phone: z.string().nullable(),
  googleRating: z.number().nullable(),
  googleReviews: z.number().nullable(),
});

const contactSummary = z.object({
  id: z.uuid(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  email: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
});

const emailSummary = z.object({
  validation: z.enum(VALIDATION_STATUSES),
  status: z.enum(EMAIL_STATUSES).nullable(),
  sentOn: z.string().nullable(),
  /** Début de l'objet (120 caractères) : permet de parcourir la file de relecture sans ouvrir chaque fiche. */
  subject: z.string().nullable(),
  promptVersion: z.string().nullable(),
  /** Motif d'exclusion du destinataire (rebond, désinscription…) : aucun envoi ni validation possible. */
  blockedReason: z.enum(SUPPRESSION_REASONS).nullable(),
  /** Contrôle de l'adresse du contact (null = pas encore contrôlée). */
  addressCheck: z.enum(ADDRESS_CHECKS).nullable(),
});

export const leadSummarySchema = z.object({
  id: z.uuid(),
  company: companySummary,
  contact: contactSummary.nullable(),
  qualification: z.enum(QUALIFICATIONS).nullable(),
  service: z.enum(SERVICES).nullable(),
  source: z.string(),
  ownerId: z.uuid().nullable(),
  stage: z.enum(PIPELINE_STAGES).nullable(),
  callStatus: z.enum(CALL_STATUSES).nullable(),
  callState: z.enum(CALL_STATES).nullable(),
  detectedAt: z.string(),
  email: emailSummary.nullable(),
});
export type LeadSummary = z.infer<typeof leadSummarySchema>;

export const leadEventSchema = z.object({
  id: z.number(),
  at: z.string(),
  type: z.string(),
  actorName: z.string().nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
});
export type LeadEvent = z.infer<typeof leadEventSchema>;

export const leadDetailSchema = leadSummarySchema.extend({
  qualificationReason: z.string().nullable(),
  serviceDetail: z.string().nullable(),
  followup1: z.enum(CALL_STATUSES).nullable(),
  followup2: z.enum(CALL_STATUSES).nullable(),
  comment: z.string().nullable(),
  nextAction: z.string().nullable(),
  dealValue: z.number().nullable(),
  pack: z.string().nullable(),
  owner: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  updatedAt: z.string(),
  companyDetail: z.object({
    address: z.string().nullable(),
    postalCode: z.string().nullable(),
    foundedYear: z.number().nullable(),
    linkedinUrl: z.string().nullable(),
    description: z.string().nullable(),
    googleCategory: z.string().nullable(),
    googleMapsUrl: z.string().nullable(),
    gps: z.string().nullable(),
    organicTraffic: z.number().nullable(),
    domainAuthority: z.number().nullable(),
    backlinks: z.number().nullable(),
    cms: z.string().nullable(),
    isEcommerce: z.boolean().nullable(),
    hasGtm: z.boolean().nullable(),
    hasGa4: z.boolean().nullable(),
    hasMetaPixel: z.boolean().nullable(),
    hasGoogleAds: z.boolean().nullable(),
    hasSsl: z.boolean().nullable(),
  }),
  emailMessage: z
    .object({
      subject: z.string().nullable(),
      body: z.string().nullable(),
      validatedAt: z.string().nullable(),
      validatedBy: z.string().nullable(),
      /** Dernier échec ou incertitude d'envoi (sans donnée personnelle). */
      sendError: z.string().nullable(),
      /** Envoi réservé sans résultat connu : à vérifier chez Brevo avant toute libération. */
      sendReserved: z.boolean(),
      promptVersion: z.string().nullable(),
      /** À renvoyer à la modification : détecte qu'une autre personne a modifié l'e-mail entre-temps. */
      updatedAt: z.string(),
    })
    .nullable(),
  events: z.array(leadEventSchema),
});
export type LeadDetail = z.infer<typeof leadDetailSchema>;

const nullable = <T extends z.ZodType>(schema: T) => schema.nullable();

/** Champs modifiables d'un lead (chacun optionnel ; `null` efface la valeur). */
export const updateLeadSchema = z
  .object({
    stage: nullable(z.enum(PIPELINE_STAGES)),
    callStatus: nullable(z.enum(CALL_STATUSES)),
    followup1: nullable(z.enum(CALL_STATUSES)),
    followup2: nullable(z.enum(CALL_STATUSES)),
    callState: nullable(z.enum(CALL_STATES)),
    comment: nullable(z.string().trim().max(2000)),
    nextAction: nullable(z.string().trim().max(500)),
    qualification: nullable(z.enum(QUALIFICATIONS)),
    service: nullable(z.enum(SERVICES)),
    dealValue: nullable(z.number().min(0).max(1_000_000_000)),
    pack: nullable(z.string().trim().max(100)),
    ownerId: nullable(z.uuid()),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Au moins un champ à modifier");
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

/** Rôle minimal pour modifier chaque champ. Appliqué côté serveur ; l'interface ne fait que masquer. */
export const LEAD_FIELD_MIN_ROLE: Record<keyof UpdateLeadInput, Role> = {
  stage: "AGENT",
  callStatus: "AGENT",
  followup1: "AGENT",
  followup2: "AGENT",
  callState: "AGENT",
  comment: "AGENT",
  nextAction: "AGENT",
  qualification: "MANAGER",
  service: "MANAGER",
  dealValue: "MANAGER",
  pack: "MANAGER",
  ownerId: "MANAGER",
};

export const leadFacetsSchema = z.object({
  total: z.number(),
  qualification: z.record(z.string(), z.number()),
  stage: z.record(z.string(), z.number()),
  service: z.record(z.string(), z.number()),
  segment: z.record(z.string(), z.number()),
  source: z.record(z.string(), z.number()),
  validation: z.record(z.string(), z.number()),
  emailStatus: z.record(z.string(), z.number()),
  callState: z.record(z.string(), z.number()),
});
export type LeadFacets = z.infer<typeof leadFacetsSchema>;

/** Les mêmes critères que la liste, sans pagination ni tri : cible d'une action groupée, d'un export ou d'une vue. */
export const leadFilterSchema = leadListQuerySchema
  .omit({ limit: true, offset: true, sort: true, order: true })
  .partial();
export type LeadFilterInput = z.infer<typeof leadFilterSchema>;

/** Actions groupées : on cible des lignes choisies (`ids`) ou tout ce que sélectionne un filtre. */
export const BULK_LEADS_MAX = 5_000;
export const BULK_IDS_MAX = 500;

const bulkSet = z
  .object({
    qualification: nullable(z.enum(QUALIFICATIONS)),
    service: nullable(z.enum(SERVICES)),
    stage: nullable(z.enum(PIPELINE_STAGES)),
    callState: nullable(z.enum(CALL_STATES)),
    ownerId: nullable(z.uuid()),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Au moins un champ à modifier");

export const bulkLeadsSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(BULK_IDS_MAX).optional(),
    filter: leadFilterSchema.optional(),
    set: bulkSet,
    dryRun: z.boolean().default(false),
    /** Effectif vu en simulation ; l'application réelle est refusée (409) s'il a changé. */
    expectedCount: z.number().int().min(0).optional(),
  })
  .refine(
    (v) => (v.ids ? !v.filter : !!v.filter),
    "Indiquez soit des lignes (ids), soit un filtre, pas les deux",
  );
export type BulkLeadsInput = z.infer<typeof bulkLeadsSchema>;

export const bulkLeadsResultSchema = z.object({
  dryRun: z.boolean(),
  /** Leads ciblés. */
  matched: z.number(),
  /** Leads qui changent (ou ont changé). */
  changed: z.number(),
  /** Leads déjà dans l'état demandé : rien à faire. */
  unchanged: z.number(),
});
export type BulkLeadsResult = z.infer<typeof bulkLeadsResultSchema>;

/** Création manuelle d'un lead (un prospect trouvé hors import). */
export const createLeadSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  website: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(100).optional(),
  sector: z.string().trim().max(100).optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  jobTitle: z.string().trim().max(150).optional(),
  email: z.string().trim().max(254).optional(),
  /** Réservé aux responsables, comme à la modification. */
  qualification: z.enum(QUALIFICATIONS).optional(),
  service: z.enum(SERVICES).optional(),
  comment: z.string().trim().max(2000).optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const pipelineQuerySchema = z.object({
  qualification: withNone(QUALIFICATIONS).optional(),
  owner: z.union([z.uuid(), z.literal(NONE)]).optional(),
  q: z.string().trim().max(100).optional(),
  /** Cartes par colonne au premier chargement. */
  perStage: z.coerce.number().int().min(1).max(50).default(20),
});

export const pipelineStageSchema = z.object({
  stage: z.enum(PIPELINE_STAGES),
  count: z.number(),
  /** Somme des valeurs de deal de la colonne (0 si aucune n'est renseignée). */
  value: z.number(),
  items: z.array(leadSummarySchema),
});

export const pipelineBoardSchema = z.object({
  stages: z.array(pipelineStageSchema),
  /** Leads sans étape : hors du tableau, à classer depuis la liste. */
  unstaged: z.number(),
});
export type PipelineBoard = z.infer<typeof pipelineBoardSchema>;

export const pipelineMoreQuerySchema = pipelineQuerySchema.omit({ perStage: true }).extend({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const pipelineMoreSchema = z.object({
  items: z.array(leadSummarySchema),
  total: z.number(),
});

export const userOptionSchema = z.object({ id: z.uuid(), name: z.string() });

export const SAVED_VIEW_PAGES = ["leads", "calls", "emails"] as const;
export const SAVED_VIEWS_MAX = 30;

export const savedViewSchema = z.object({
  id: z.uuid(),
  page: z.enum(SAVED_VIEW_PAGES),
  name: z.string(),
  filters: z.record(z.string(), z.string()),
  createdAt: z.string(),
});
export type SavedView = z.infer<typeof savedViewSchema>;

export const createSavedViewSchema = z.object({
  page: z.enum(SAVED_VIEW_PAGES),
  name: z.string().trim().min(1).max(60),
  /** Les critères tels que l'interface les garde dans l'adresse (texte). */
  filters: z
    .record(z.string().max(40), z.string().max(200))
    .refine((f) => Object.keys(f).length <= 20, "Trop de critères"),
});
