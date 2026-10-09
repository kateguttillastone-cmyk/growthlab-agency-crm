/**
 * Catalogue unique du vocabulaire métier (étapes, qualifications…). Repris de l'ancienne application
 * (legacy/source-artifact.html) ; il sera lu par l'API, le front et le prompt de scoring (voir docs/06).
 */
export const PIPELINE_STAGES = [
  "Nouveau",
  "Contacté",
  "Répondu",
  "RDV programmé",
  "RDV effectué",
  "Proposition envoyée",
  "Négociation",
  "Gagné",
  "Perdu",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const QUALIFICATIONS = ["Chaud", "Tiède", "Froid"] as const;
export type Qualification = (typeof QUALIFICATIONS)[number];

export const VALIDATION_STATUSES = ["Pas Validé", "Validé", "Rejeté"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const CALL_STATUSES = [
  "NRP",
  "PI",
  "PB NUMERO",
  "REPONDEUR",
  "A RAP",
  "BARRAGE SECRETAIRE",
  "RDV fixé",
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const CALL_STATES = ["À appeler", "Injoignable", "RDV fixé", "Répondu", "Pas intéressé"] as const;
export type CallState = (typeof CALL_STATES)[number];

export const EMAIL_STATUSES = ["Envoyé", "Délivré", "Ouvert", "Bounce", "Désinscrit"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** Service d'entrée recommandé (les 25 formulations libres de l'ancienne base sont ramenées à ces trois valeurs). */
export const SERVICES = ["Google Ads", "Création de site", "Refonte de site"] as const;
export type Service = (typeof SERVICES)[number];

export const SEGMENTS = ["with_website", "no_website"] as const;
export type Segment = (typeof SEGMENTS)[number];

/** Correspondance automatique statut d'appel → étape du pipeline (règle EXG-F-053). */
export const CALL_STATUS_TO_STAGE: Partial<Record<CallStatus, PipelineStage>> = {
  NRP: "Contacté",
  REPONDEUR: "Contacté",
  "A RAP": "Contacté",
  "BARRAGE SECRETAIRE": "Contacté",
  PI: "Perdu",
  "RDV fixé": "RDV programmé",
};

const STAGE_RANK: Record<PipelineStage, number> = Object.fromEntries(
  PIPELINE_STAGES.map((stage, i) => [stage, i]),
) as Record<PipelineStage, number>;

/**
 * Étape du pipeline après l'enregistrement d'un statut d'appel.
 * Règles : le statut n'a pas de correspondance → rien ne change ; « Gagné » et « Perdu » ne sont jamais modifiés
 * automatiquement ; l'étape ne fait jamais reculer un lead déjà plus avancé (décision de la feuille de route,
 * PRD EXG-F-054).
 */
export function nextStageForCallStatus(
  current: PipelineStage | null,
  status: CallStatus | null,
): PipelineStage | null {
  if (!status) return current;
  const target = CALL_STATUS_TO_STAGE[status];
  if (!target) return current;
  if (current === "Gagné" || current === "Perdu") return current;
  if (current === null) return target;
  return STAGE_RANK[target] > STAGE_RANK[current] ? target : current;
}
