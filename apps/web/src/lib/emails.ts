import { type BulkFilter, NONE } from "@gac/shared";

export type ReviewTab = "review" | "validated" | "rejected";

export const TABS: Array<{ id: ReviewTab; label: string }> = [
  { id: "review", label: "À relire" },
  { id: "validated", label: "Validés, non envoyés" },
  { id: "rejected", label: "Rejetés" },
];

export interface QueueFilters {
  tab: ReviewTab;
  q: string;
  qualification: string;
  promptVersion: string;
}

/** Paramètres de la liste de leads pour une file de relecture (aucun envoyé, les plus chauds d'abord). */
export function queueQuery(f: QueueFilters, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams({ sort: "qualification", order: "asc" });
  if (f.tab === "review") {
    p.set("validation", "Pas Validé");
    p.set("hasEmail", "true");
    p.set("emailStatus", NONE);
  } else if (f.tab === "validated") {
    p.set("validation", "Validé");
    p.set("emailStatus", NONE);
  } else {
    p.set("validation", "Rejeté");
  }
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.qualification) p.set("qualification", f.qualification);
  if (f.promptVersion) p.set("promptVersion", f.promptVersion);
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p.toString();
}

/** Filtre de la validation groupée : les critères visibles à l'écran, sans l'onglet. */
export function bulkFilter(f: QueueFilters): BulkFilter {
  return {
    ...(f.q.trim() ? { q: f.q.trim() } : {}),
    ...(f.qualification ? { qualification: f.qualification as BulkFilter["qualification"] } : {}),
    ...(f.promptVersion ? { promptVersion: f.promptVersion } : {}),
  };
}

/** Élément à ouvrir après traitement de `currentId` : le suivant, sinon le précédent, sinon rien. */
export function nextAfter(ids: string[], currentId: string): string | null {
  const i = ids.indexOf(currentId);
  if (i === -1) return ids[0] ?? null;
  return ids[i + 1] ?? ids[i - 1] ?? null;
}

export const BLOCKED_LABELS: Record<string, string> = {
  unsubscribe: "désinscription",
  bounce: "rebond",
  complaint: "plainte",
  manual: "exclusion manuelle",
};
