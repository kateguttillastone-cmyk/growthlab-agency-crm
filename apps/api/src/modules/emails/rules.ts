import type { BulkEmailResult } from "@gac/shared";

export interface ReviewState {
  subject: string | null;
  body: string | null;
  email: string | null;
  blocked: string | null;
}

/** Motif pour lequel un e-mail ne peut pas être validé (null = validable). */
export function reviewBlocker({ subject, body, email, blocked }: ReviewState): string | null {
  if (!email) return "Ce prospect n'a pas d'adresse e-mail : impossible de valider l'envoi";
  if (blocked)
    return "Cette adresse est dans la liste d'exclusion (rebond, désinscription…) : validation interdite";
  if (!subject?.trim() || !body?.trim()) return "L'objet et le corps doivent être renseignés";
  return null;
}

const LABELS = {
  already: "Déjà traités ou envoyés",
  no_recipient: "Sans adresse e-mail",
  suppressed: "Adresse exclue",
  empty: "Objet ou corps vide",
} as const;

export function bulkClassification<
  T extends ReviewState & { id: string; leadId: string; validation: string; status: string | null },
>(rows: T[], target: "Validé" | "Rejeté"): { eligible: T[]; skipped: BulkEmailResult["skipped"] } {
  const eligible: T[] = [];
  const skipped: Record<string, number> = {};
  const skip = (k: keyof typeof LABELS) => {
    skipped[LABELS[k]] = (skipped[LABELS[k]] ?? 0) + 1;
  };
  for (const row of rows) {
    if (row.validation !== "Pas Validé" || row.status !== null) skip("already");
    else if (target === "Rejeté") eligible.push(row);
    else if (!row.email) skip("no_recipient");
    else if (row.blocked) skip("suppressed");
    else if (!row.subject?.trim() || !row.body?.trim()) skip("empty");
    else eligible.push(row);
  }
  return { eligible, skipped };
}
