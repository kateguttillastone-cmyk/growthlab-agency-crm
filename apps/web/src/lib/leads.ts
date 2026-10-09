import {
  CALL_STATES,
  CALL_STATUSES,
  EMAIL_STATUSES,
  type LeadListQuery,
  NONE,
  PIPELINE_STAGES,
  QUALIFICATIONS,
  SEGMENTS,
  SERVICES,
  VALIDATION_STATUSES,
} from "@gac/shared";

/** Filtres de la liste, tels qu'ils vivent dans l'adresse de la page (partageable, survit au rechargement). */
export type LeadFilters = Partial<
  Pick<
    LeadListQuery,
    | "q"
    | "qualification"
    | "stage"
    | "service"
    | "segment"
    | "validation"
    | "emailStatus"
    | "callState"
    | "sort"
    | "order"
  >
> & { hasEmail?: "true" | "false" };

const KEYS = [
  "q",
  "qualification",
  "stage",
  "service",
  "segment",
  "validation",
  "emailStatus",
  "callState",
  "sort",
  "order",
  "hasEmail",
] as const;

const ALLOWED: Partial<Record<(typeof KEYS)[number], readonly string[]>> = {
  qualification: [...QUALIFICATIONS, NONE],
  stage: [...PIPELINE_STAGES, NONE],
  service: SERVICES,
  segment: SEGMENTS,
  validation: VALIDATION_STATUSES,
  emailStatus: [...EMAIL_STATUSES, NONE],
  callState: [...CALL_STATES, NONE],
  sort: ["detectedAt", "company", "qualification", "employees", "rating", "traffic"],
  order: ["asc", "desc"],
  hasEmail: ["true", "false"],
};

/** Lit les filtres depuis l'adresse ; toute valeur inconnue est ignorée (une adresse modifiée à la main ne casse rien). */
export function filtersFromParams(params: URLSearchParams): LeadFilters {
  const out: Record<string, string> = {};
  for (const key of KEYS) {
    const v = params.get(key);
    if (!v) continue;
    const allowed = ALLOWED[key];
    if (allowed && !allowed.includes(v)) continue;
    out[key] = v;
  }
  return out as LeadFilters;
}

/** Ecrit les filtres dans une chaîne de requête (sans valeurs vides). */
export function toQueryString(filters: LeadFilters, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams();
  for (const key of KEYS) {
    const v = filters[key];
    if (v) p.set(key, v);
  }
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p.toString();
}

export interface LeadPreset {
  id: string;
  label: string;
  hint: string;
  filters: LeadFilters;
}

/** Vues rapides, inspirées de ce que l'équipe fait réellement (voir docs/11-analyse-export-airtable.md). */
export const PRESETS: LeadPreset[] = [
  { id: "all", label: "Tous", hint: "Tous les prospects", filters: {} },
  {
    id: "to-call",
    label: "À appeler",
    hint: "Prospects sans site web, à appeler",
    filters: { segment: "no_website", callState: "À appeler" },
  },
  {
    id: "review",
    label: "E-mails à relire",
    hint: "E-mail rédigé, pas encore validé",
    filters: { validation: "Pas Validé", hasEmail: "true" },
  },
  { id: "hot", label: "Chauds", hint: "Qualification « Chaud »", filters: { qualification: "Chaud" } },
  {
    id: "bounced",
    label: "Rebonds",
    hint: "Adresses en échec : à corriger ou retirer",
    filters: { emailStatus: "Bounce" },
  },
];

/** Vue rapide correspondant exactement aux filtres (hors tri et recherche), s'il y en a une. */
export function activePreset(f: LeadFilters): string | null {
  const keys = (x: LeadFilters) =>
    Object.entries(x)
      .filter(([k, v]) => v && !["q", "sort", "order"].includes(k))
      .sort(([a], [b]) => a.localeCompare(b));
  const current = JSON.stringify(keys(f));
  return PRESETS.find((p) => JSON.stringify(keys(p.filters)) === current)?.id ?? null;
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";
}

export function formatNumber(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString("fr-FR");
}

export function triState(v: boolean | null | undefined): string {
  return v === null || v === undefined ? "Non mesuré" : v ? "Oui" : "Non";
}

export function contactName(c: { firstName: string | null; lastName: string | null } | null): string {
  return c ? [c.firstName, c.lastName].filter(Boolean).join(" ") : "";
}

/** Numéro +33… affiché à la française (01 23 45 67 89) ; les autres sont rendus tels quels. */
export function displayPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const m = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(phone);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : phone;
}

// Etiquettes visuelles : toujours un texte, jamais la couleur seule.
export const QUALIFICATION_STYLE: Record<string, string> = {
  Chaud: "bg-red-100 text-red-900",
  Tiède: "bg-amber-100 text-amber-900",
  Froid: "bg-sky-100 text-sky-900",
};

export const EMAIL_STATUS_STYLE: Record<string, string> = {
  Envoyé: "bg-slate-100 text-slate-800",
  Délivré: "bg-green-100 text-green-900",
  Ouvert: "bg-emerald-100 text-emerald-900",
  Bounce: "bg-red-100 text-red-900",
  Désinscrit: "bg-orange-100 text-orange-900",
};

export const CALL_STATUS_LIST = CALL_STATUSES;

/**
 * Adresse sûre à mettre dans un lien : http(s) uniquement. Une valeur issue des données (site web, LinkedIn)
 * ne doit jamais pouvoir produire un lien `javascript:` ou `data:`. Sans protocole, https est supposé.
 */
export function safeUrl(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const FIELD_LABELS: Record<string, string> = {
  stage: "Étape",
  callStatus: "Statut d'appel",
  followup1: "Relance 1",
  followup2: "Relance 2",
  callState: "File d'appel",
  comment: "Commentaire",
  nextAction: "Prochaine action",
  qualification: "Qualification",
  service: "Service",
  dealValue: "Valeur du deal",
  pack: "Pack",
  ownerId: "Responsable",
};

/** Phrase lisible pour une ligne de l'historique. */
export function describeEvent(e: { type: string; data: Record<string, unknown> | null }): string {
  if (e.type === "imported") return "Importé depuis l'ancienne base";
  const d = e.data ?? {};
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
  const label = FIELD_LABELS[String(d.field)] ?? String(d.field ?? e.type);
  const auto = d.auto ? ` (automatique : ${String(d.reason ?? "règle du pipeline")})` : "";
  return `${label} : ${show(d.from)} → ${show(d.to)}${auto}`;
}
