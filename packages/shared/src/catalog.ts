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

/** Correspondance automatique statut d'appel → étape du pipeline (règle EXG-F-053). */
export const CALL_STATUS_TO_STAGE: Partial<Record<CallStatus, PipelineStage>> = {
  NRP: "Contacté",
  REPONDEUR: "Contacté",
  "A RAP": "Contacté",
  "BARRAGE SECRETAIRE": "Contacté",
  PI: "Perdu",
  "RDV fixé": "RDV programmé",
};
