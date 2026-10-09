import type { CallStatus } from "@gac/shared";

export type CallTab = "to-call" | "callback";

export const CALL_TABS: Array<{ id: CallTab; label: string }> = [
  { id: "to-call", label: "À appeler" },
  { id: "callback", label: "À rappeler" },
];

/** Issues d'un appel, dans l'ordre d'affichage (les plus fréquentes d'abord). */
export const CALL_OUTCOMES: Array<{
  value: CallStatus;
  label: string;
  hint: string;
  variant: "primary" | "ghost" | "danger";
}> = [
  { value: "NRP", label: "Ne répond pas", hint: "Reste dans la file, rappelé plus tard", variant: "ghost" },
  { value: "REPONDEUR", label: "Répondeur", hint: "Reste dans la file, rappelé plus tard", variant: "ghost" },
  {
    value: "BARRAGE SECRETAIRE",
    label: "Barrage secrétaire",
    hint: "Reste dans la file, rappelé plus tard",
    variant: "ghost",
  },
  {
    value: "A RAP",
    label: "À rappeler",
    hint: "Sort de la file, passe dans « À rappeler »",
    variant: "ghost",
  },
  { value: "PB NUMERO", label: "Mauvais numéro", hint: "Classé injoignable", variant: "ghost" },
  { value: "PI", label: "Pas intéressé", hint: "Étape « Perdu »", variant: "danger" },
  { value: "RDV fixé", label: "RDV fixé", hint: "Étape « RDV programmé »", variant: "primary" },
];

/** Paramètres de la liste de leads pour la file d'appel (jamais appelés d'abord, groupés par ville). */
export function callQueueQuery(
  tab: CallTab,
  f: { city: string; qualification: string },
  extra: Record<string, string | number> = {},
): string {
  const p = new URLSearchParams({
    callState: tab === "to-call" ? "À appeler" : "Répondu",
    hasPhone: "true",
    sort: "calls",
    order: "asc",
  });
  if (f.city.trim()) p.set("city", f.city.trim());
  if (f.qualification) p.set("qualification", f.qualification);
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p.toString();
}

/** Lien `tel:` : chiffres et « + » uniquement (la valeur vient des données, jamais d'un lien brut). */
export function telHref(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/[^\d+]/g, "") ?? "";
  return /^\+?\d{6,15}$/.test(digits) ? `tel:${digits}` : null;
}

/** Premier prospect de la file qui n'a pas été passé. */
export function currentOf<T extends { id: string }>(items: T[], skipped: string[]): T | null {
  return items.find((i) => !skipped.includes(i.id)) ?? null;
}
