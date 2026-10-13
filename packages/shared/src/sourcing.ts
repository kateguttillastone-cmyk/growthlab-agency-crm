import { z } from "zod";

/** Sources de prospects. « google_maps » : fiches d'établissement ; « linkedin » : décideurs d'entreprises (ancien Lead Finder). */
export const SOURCING_SOURCES = ["google_maps", "linkedin"] as const;
export type SourcingSource = (typeof SOURCING_SOURCES)[number];
export const SOURCING_SOURCE_LABELS: Record<SourcingSource, string> = {
  google_maps: "Google Maps (fiches d'établissement)",
  linkedin: "LinkedIn (décideurs d'entreprises)",
};

export const SOURCING_STATES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type SourcingState = (typeof SOURCING_STATES)[number];
export const SOURCING_STATE_LABELS: Record<SourcingState, string> = {
  queued: "En attente",
  running: "En cours",
  succeeded: "Terminée",
  failed: "Échec",
  cancelled: "Annulée",
};

/** Critères d'une recherche. Les villes sont saisies séparées par des virgules côté écran. */
export const sourcingCriteriaSchema = z.object({
  source: z.enum(SOURCING_SOURCES),
  /** Métier, secteur ou intitulé de poste recherché. */
  query: z.string().trim().min(2).max(120),
  cities: z.array(z.string().trim().min(2).max(80)).min(1).max(10),
  maxResults: z.number().int().min(1).max(200),
  /** Google Maps : ne garder que les établissements sans site web. */
  noWebsiteOnly: z.boolean().default(false),
});
export type SourcingCriteria = z.infer<typeof sourcingCriteriaSchema>;

export const createSourcingRunSchema = z.object({
  criteria: sourcingCriteriaSchema,
  /** Simulation : coût maximal et doublons probables, rien n'est lancé. */
  dryRun: z.boolean().default(false),
  /** Coût vu en simulation ; le lancement est refusé (409) s'il a changé (tarif, plafond). */
  expectedCost: z.number().min(0).optional(),
});
export type CreateSourcingRunInput = z.infer<typeof createSourcingRunSchema>;

export const sourcingEstimateSchema = z.object({
  dryRun: z.boolean(),
  estimatedCost: z.number(),
  maxResults: z.number(),
  /** Entreprises déjà connues dans les mêmes villes et le même secteur : ordre de grandeur des doublons. */
  probableDuplicates: z.number(),
  spentToday: z.number(),
  dailyBudget: z.number(),
});
export type SourcingEstimate = z.infer<typeof sourcingEstimateSchema>;

export const sourcingRunSchema = z.object({
  id: z.uuid(),
  criteria: sourcingCriteriaSchema,
  state: z.enum(SOURCING_STATES),
  estimatedCost: z.number(),
  cost: z.number().nullable(),
  /** Avancement connu du fournisseur (0 à 100). */
  progress: z.number().nullable(),
  found: z.number().nullable(),
  created: z.number().nullable(),
  duplicates: z.number().nullable(),
  /** Écartés : hors France, sans numéro exploitable ou illisibles. */
  rejected: z.number().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});
export type SourcingRun = z.infer<typeof sourcingRunSchema>;

export const sourcingRunPageSchema = z.object({
  items: z.array(sourcingRunSchema),
  total: z.number(),
});
export type SourcingRunPage = z.infer<typeof sourcingRunPageSchema>;

export const sourcingStatusSchema = z.object({
  mode: z.enum(["off", "apify"]),
  /** Faux si le mode est actif mais qu'il manque un jeton. */
  configured: z.boolean(),
  costPerResult: z.number(),
  dailyBudget: z.number(),
  spentToday: z.number(),
  maxPerRun: z.number(),
});
export type SourcingStatus = z.infer<typeof sourcingStatusSchema>;

export const sourcingListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
