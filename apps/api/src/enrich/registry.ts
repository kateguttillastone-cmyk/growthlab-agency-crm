import type { RegistryStatus } from "@gac/shared";

/** Société renvoyée par l'API publique recherche-entreprises (champs utiles uniquement). */
export interface RegistryHit {
  siren: string;
  /** Noms sous lesquels la société est connue (dénomination, nom commercial, enseignes). */
  names: string[];
  city: string | null;
  active: boolean;
  closedOn: string | null;
}

/** Cherche des sociétés par nom ; remplaçable en test (aucun appel réseau dans les tests). */
export type RegistryFetcher = (name: string) => Promise<RegistryHit[]>;

export type RegistryOutcome =
  | { status: "not_found" }
  | { status: Exclude<RegistryStatus, "closed" | "to_confirm">; siren: string }
  | { status: "closed" | "to_confirm"; siren: string; closedOn: string | null };

const LEGAL_FORMS = /\b(sarl|sas|sasu|eurl|sa|sci|snc|selarl|selas|scop|sca|gmbh|ltd|llc|inc)\b/g;

const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Nom sans accents, ponctuation, espaces ni forme juridique : « Vapoclope Sarl » et « VAPOCLOPE » se confondent. */
export const registryKey = (name: string): string => fold(name).replace(LEGAL_FORMS, " ").replace(/\s+/g, "");

const sameCity = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && fold(a) === fold(b);

/**
 * Décide de la situation d'une entreprise à partir des sociétés du registre qui lui ressemblent.
 *
 * Prudence voulue (une fausse fermeture retire un vrai prospect) :
 * - une seule société active portant le même nom suffit à conclure « en activité » ;
 * - « fermée » exige un nom identique ET la même ville ; sinon « à confirmer » (homonyme, ancienne entité, autre
 *   établissement) et c'est une personne qui tranche ;
 * - aucune société trouvée : rien n'est marqué (marque commerciale, société étrangère).
 */
export function classifyRegistry(
  company: { name: string; city: string | null },
  hits: RegistryHit[],
): RegistryOutcome {
  const wanted = registryKey(company.name);
  if (!wanted) return { status: "not_found" };

  const related = hits.filter((h) =>
    h.names.some((n) => {
      const k = registryKey(n);
      return k !== "" && (k === wanted || (wanted.length >= 6 && (k.includes(wanted) || wanted.includes(k))));
    }),
  );
  if (related.length === 0) return { status: "not_found" };

  const isExact = (h: RegistryHit) => h.names.some((n) => registryKey(n) === wanted);

  const active = related.filter((h) => h.active);
  const keep = active.find(isExact) ?? active[0];
  if (keep) return { status: "active", siren: keep.siren };

  const sure = related.find((h) => isExact(h) && sameCity(h.city, company.city));
  if (sure) return { status: "closed", siren: sure.siren, closedOn: sure.closedOn };
  const closest = related.find(isExact) ?? related[0];
  if (!closest) return { status: "not_found" };
  return { status: "to_confirm", siren: closest.siren, closedOn: closest.closedOn };
}

const ENDPOINT = "https://recherche-entreprises.api.gouv.fr/search";
const TIMEOUT_MS = 8000;

interface ApiResult {
  siren?: string;
  nom_complet?: string;
  nom_raison_sociale?: string | null;
  etat_administratif?: string;
  date_fermeture?: string | null;
  siege?: {
    nom_commercial?: string | null;
    liste_enseignes?: string[] | null;
    libelle_commune?: string | null;
  };
}

/** Appelle l'API officielle (publique, sans clé) ; une limite de débit est retentée une fois. */
export const httpRegistryFetcher: RegistryFetcher = async (name) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(name)}&per_page=10`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "gac-pilot" },
    });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (!res.ok) throw new Error(`registre : réponse ${res.status}`);
    const body = (await res.json()) as { results?: ApiResult[] };
    return (body.results ?? []).flatMap((r) =>
      r.siren
        ? [
            {
              siren: r.siren,
              names: [
                r.nom_complet,
                r.nom_raison_sociale,
                r.siege?.nom_commercial,
                ...(r.siege?.liste_enseignes ?? []),
              ].filter((n): n is string => !!n),
              city: r.siege?.libelle_commune ?? null,
              active: r.etat_administratif === "A",
              closedOn: r.date_fermeture ?? null,
            },
          ]
        : [],
    );
  }
  throw new Error("registre : limite de débit");
};
