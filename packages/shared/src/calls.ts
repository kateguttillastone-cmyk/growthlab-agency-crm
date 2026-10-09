import { z } from "zod";
import {
  CALL_STATUSES,
  type CallState,
  type CallStatus,
  nextStageForCallStatus,
  type PipelineStage,
} from "./catalog";

/** Nombre d'appels sans réponse utile après lequel un prospect est classé « Injoignable ». */
export const MAX_UNANSWERED_ATTEMPTS = 3;
export const CALL_NOTE_MAX = 1000;

export const logCallSchema = z.object({
  outcome: z.enum(CALL_STATUSES),
  /** Note libre, ajoutée (jamais substituée) au commentaire du lead. */
  note: z.string().trim().max(CALL_NOTE_MAX).optional(),
});
export type LogCallInput = z.infer<typeof logCallSchema>;

type Slot = "callStatus" | "followup1" | "followup2";
const SLOTS: Slot[] = ["callStatus", "followup1", "followup2"];

export interface CallSnapshot {
  stage: PipelineStage | null;
  callStatus: CallStatus | null;
  followup1: CallStatus | null;
  followup2: CallStatus | null;
}

export interface CallPlan {
  /** Case renseignée : 1er appel, relance 1, relance 2 (la dernière est réécrite ensuite). */
  slot: Slot;
  callState: CallState;
  stage: PipelineStage | null;
  attempts: number;
}

/**
 * Règle d'un appel. Le résultat va dans la première case libre (appel, relance 1, relance 2). La file d'appel suit :
 * rendez-vous / pas intéressé / numéro faux / à rappeler sortent de la file « À appeler » ; une absence de réponse, un
 * répondeur ou un barrage y restent jusqu'à {@link MAX_UNANSWERED_ATTEMPTS} essais, puis le prospect devient injoignable.
 * L'étape du pipeline avance sans jamais reculer.
 */
export function planCall(current: CallSnapshot, outcome: CallStatus): CallPlan {
  const slot = SLOTS.find((s) => current[s] === null) ?? "followup2";
  const attempts = SLOTS.filter((s) => current[s] !== null || s === slot).length;
  const callState: CallState =
    outcome === "RDV fixé"
      ? "RDV fixé"
      : outcome === "PI"
        ? "Pas intéressé"
        : outcome === "PB NUMERO"
          ? "Injoignable"
          : outcome === "A RAP"
            ? "Répondu"
            : attempts >= MAX_UNANSWERED_ATTEMPTS
              ? "Injoignable"
              : "À appeler";
  return { slot, callState, stage: nextStageForCallStatus(current.stage, outcome), attempts };
}
