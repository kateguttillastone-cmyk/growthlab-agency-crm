import type { SourcingCriteria } from "@gac/shared";
import type { FoundProspect, PollResult, SourcingProvider } from "./provider";

const API = "https://api.apify.com/v2";

type Json = Record<string, unknown>;
type Fetch = typeof fetch;

export interface ApifyOptions {
  token: string;
  actorMaps: string;
  actorLeads: string;
  usdToEur: number;
  fetch?: Fetch;
}

/** Apify : un acteur par source. Le jeton ne voyage que dans l'en-tête Authorization, jamais dans l'adresse ni les messages d'erreur. */
export function apifyProvider(o: ApifyOptions): SourcingProvider {
  const doFetch = o.fetch ?? fetch;
  const call = async (path: string, init: { method?: string; body?: unknown } = {}): Promise<Json> => {
    let res: Response;
    try {
      res = await doFetch(`${API}${path}`, {
        method: init.method ?? "GET",
        headers: {
          authorization: `Bearer ${o.token}`,
          ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error("Apify est injoignable");
    }
    if (!res.ok) {
      const hint =
        res.status === 401 || res.status === 403
          ? "jeton refusé"
          : res.status === 402
            ? "crédit ou quota Apify insuffisant"
            : res.status === 429
              ? "trop de requêtes"
              : "erreur du service";
      throw new Error(`Apify a répondu ${res.status} (${hint})`);
    }
    return (await res.json()) as Json;
  };
  const data = (j: Json): Json => (j.data ?? {}) as Json;

  return {
    async start(c) {
      const actor = c.source === "google_maps" ? o.actorMaps : o.actorLeads;
      const run = data(
        await call(`/acts/${encodeURIComponent(actor)}/runs`, { method: "POST", body: buildInput(c) }),
      );
      if (typeof run.id !== "string") throw new Error("Apify n'a pas renvoyé d'identifiant de recherche");
      // l'identifiant garde la source : les résultats se lisent avec la bonne correspondance de champs
      return { providerRunId: `${c.source}:${run.id}` };
    },

    async poll(providerRunId): Promise<PollResult> {
      const [source, id] = splitId(providerRunId);
      const run = data(await call(`/actor-runs/${encodeURIComponent(id)}`));
      const status = String(run.status ?? "");
      if (["READY", "RUNNING", "ABORTING", "TIMING-OUT"].includes(status)) return { state: "running" };
      if (status !== "SUCCEEDED") {
        return { state: "failed", error: `Apify : exécution ${status.toLowerCase() || "inconnue"}` };
      }
      const dataset = String(run.defaultDatasetId ?? "");
      if (!dataset) return { state: "failed", error: "Apify : résultats introuvables" };
      const res = await doFetch(
        `${API}/datasets/${encodeURIComponent(dataset)}/items?clean=true&format=json&limit=1000`,
        {
          headers: { authorization: `Bearer ${o.token}` },
          signal: AbortSignal.timeout(60_000),
        },
      ).catch(() => null);
      if (!res?.ok) return { state: "failed", error: "Apify : lecture des résultats impossible" };
      const raw = (await res.json()) as unknown;
      const rows = Array.isArray(raw) ? (raw as Json[]) : [];
      const items = rows
        .map((r) => (source === "google_maps" ? fromMaps(r) : fromLeadsFinder(r)))
        .filter(isProspect);
      if (rows.length > 0 && items.length === 0) {
        // jamais de valeur dans le message : seulement les noms de champs, pour diagnostiquer un changement de format
        const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 25).join(", ");
        return { state: "failed", error: `Format de résultat inattendu (champs reçus : ${keys})` };
      }
      const usd = typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : undefined;
      return {
        state: "succeeded",
        items,
        ...(usd !== undefined ? { cost: Math.round(usd * o.usdToEur * 100) / 100 } : {}),
      };
    },

    async abort(providerRunId) {
      const [, id] = splitId(providerRunId);
      await call(`/actor-runs/${encodeURIComponent(id)}/abort`, { method: "POST" });
    },
  };
}

function splitId(v: string): [string, string] {
  const i = v.indexOf(":");
  return i < 0 ? ["google_maps", v] : [v.slice(0, i), v.slice(i + 1)];
}

/** Entrée de l'acteur. Google Maps : une requête par ville ; Lead Finder : poste, lieu, tailles 1-10 et 11-20 comme avant. */
export function buildInput(c: SourcingCriteria): Json {
  if (c.source === "google_maps") {
    return {
      searchStringsArray: c.cities.map((city) => `${c.query} ${city}`),
      maxCrawledPlacesPerSearch: Math.max(1, Math.ceil(c.maxResults / c.cities.length)),
      language: "fr",
      countryCode: "fr",
      skipClosedPlaces: true,
      website: c.noWebsiteOnly ? "withoutWebsite" : "allPlaces",
    };
  }
  return {
    contact_job_title: [c.query],
    contact_location: c.cities,
    company_size: ["1-10", "11-20"],
    email_status: ["validated"],
    fetch_count: c.maxResults,
    file_name: "gac-sourcing",
  };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const first = (r: Json, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = str(r[k]);
    if (v) return v;
  }
  return null;
};

function isProspect(p: FoundProspect | null): p is FoundProspect {
  return p !== null;
}

export function fromMaps(r: Json): FoundProspect | null {
  const companyName = first(r, "title", "name");
  if (!companyName) return null;
  return {
    companyName,
    website: first(r, "website"),
    phone: first(r, "phone", "phoneUnformatted"),
    city: first(r, "city"),
    postalCode: first(r, "postalCode"),
    address: first(r, "address"),
    sector: first(r, "categoryName"),
    googleCategory: first(r, "categoryName"),
    googleRating: num(r.totalScore),
    googleReviews: num(r.reviewsCount),
    googleMapsUrl: first(r, "url"),
  };
}

export function fromLeadsFinder(r: Json): FoundProspect | null {
  const companyName = first(r, "company_name", "organization_name", "company");
  if (!companyName) return null;
  const employees = first(r, "company_size", "employees");
  return {
    companyName,
    website: first(r, "company_website", "website", "company_domain"),
    phone: first(r, "company_phone", "phone", "mobile_number"),
    city: first(r, "city", "company_city"),
    sector: first(r, "industry", "company_industry"),
    firstName: first(r, "first_name"),
    lastName: first(r, "last_name"),
    jobTitle: first(r, "job_title", "title"),
    email: first(r, "email"),
    employees: employees && /^\d+$/.test(employees) ? Number(employees) : null,
    linkedinUrl: first(r, "linkedin", "company_linkedin"),
  };
}
