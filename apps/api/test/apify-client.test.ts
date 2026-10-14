import type { SourcingCriteria } from "@gac/shared";
import { describe, expect, it } from "vitest";
import { apifyProvider, buildInput, fromLeadsFinder, fromMaps } from "../src/sourcing/apify";

const TOKEN = "apify_api_SECRET_de_test";
const opts = { token: TOKEN, actorMaps: "acteur~maps", actorLeads: "acteur~leads", usdToEur: 0.5 };

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
function fakeFetch(responses: Array<{ status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = responses.shift() ?? { status: 500, json: {} };
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const c: SourcingCriteria = {
  source: "google_maps",
  query: "Plombier",
  cities: ["Lyon", "Annecy"],
  maxResults: 20,
  noWebsiteOnly: true,
};

describe("Apify : entrées, état, résultats, secrets", () => {
  it("construit l'entrée de chaque acteur", () => {
    expect(buildInput(c)).toMatchObject({
      searchStringsArray: ["Plombier Lyon", "Plombier Annecy"],
      maxCrawledPlacesPerSearch: 10,
      website: "withoutWebsite",
    });
    expect(buildInput({ ...c, source: "linkedin", noWebsiteOnly: false })).toMatchObject({
      contact_job_title: ["Plombier"],
      company_size: ["1-10", "11-20"],
      fetch_count: 20,
    });
  });

  it("lance l'acteur avec le jeton dans l'en-tête seulement", async () => {
    const f = fakeFetch([{ status: 201, json: { data: { id: "r1" } } }]);
    const p = apifyProvider({ ...opts, fetch: f.fn });
    expect(await p.start(c)).toEqual({ providerRunId: "google_maps:r1" });
    expect(f.calls[0]?.url).toBe("https://api.apify.com/v2/acts/acteur~maps/runs");
    expect(f.calls[0]?.url).not.toContain(TOKEN);
    expect(f.calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("traduit l'état, lit les résultats et convertit le coût", async () => {
    const f = fakeFetch([
      { json: { data: { status: "RUNNING" } } },
      { json: { data: { status: "SUCCEEDED", defaultDatasetId: "d1", usageTotalUsd: 0.7 } } },
      {
        json: [
          {
            title: "Plomberie Test",
            phone: "04 50 00 00 00",
            website: null,
            totalScore: 4.5,
            reviewsCount: 12,
            url: "https://maps.example/x",
          },
          { foo: 1 },
        ],
      },
      { json: { data: { status: "FAILED" } } },
    ]);
    const p = apifyProvider({ ...opts, fetch: f.fn });
    expect(await p.poll("google_maps:r1")).toEqual({ state: "running" });
    const done = await p.poll("google_maps:r1");
    expect(done).toMatchObject({ state: "succeeded", cost: 0.35 });
    expect(done.state === "succeeded" && done.items).toEqual([
      expect.objectContaining({ companyName: "Plomberie Test", googleRating: 4.5, googleReviews: 12 }),
    ]);
    expect(await p.poll("google_maps:r2")).toEqual({ state: "failed", error: "Apify : exécution failed" });
  });

  it("signale un format inattendu avec les noms de champs seulement", async () => {
    const f = fakeFetch([
      { json: { data: { status: "SUCCEEDED", defaultDatasetId: "d1" } } },
      { json: [{ nom_entreprise: "Secret SARL", tel: "0600000000" }] },
    ]);
    const res = await apifyProvider({ ...opts, fetch: f.fn }).poll("linkedin:r1");
    expect(res).toEqual({
      state: "failed",
      error: "Format de résultat inattendu (champs reçus : nom_entreprise, tel)",
    });
  });

  it("n'expose jamais le jeton dans les erreurs", async () => {
    for (const [status, text] of [
      [401, /jeton refusé/],
      [402, /crédit/],
      [500, /erreur du service/],
    ] as const) {
      const f = fakeFetch([{ status, json: { error: { message: `bad token ${TOKEN}` } } }]);
      const err = await apifyProvider({ ...opts, fetch: f.fn })
        .start(c)
        .catch((e: Error) => e);
      expect((err as Error).message).toMatch(text);
      expect((err as Error).message).not.toContain(TOKEN);
    }
  });

  it("convertit les deux formats de résultats", () => {
    expect(
      fromMaps({ title: "A", phone: "04", categoryName: "Plombier", postalCode: "74000" }),
    ).toMatchObject({
      companyName: "A",
      sector: "Plombier",
      postalCode: "74000",
    });
    expect(fromMaps({ phone: "04" })).toBeNull();
    expect(
      fromLeadsFinder({
        company_name: "B",
        first_name: "Léa",
        email: "lea@b.example",
        company_size: "11",
        company_phone: "+33450000000",
      }),
    ).toMatchObject({ companyName: "B", firstName: "Léa", employees: 11, phone: "+33450000000" });
  });
});
