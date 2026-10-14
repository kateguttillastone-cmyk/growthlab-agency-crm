import type { SourcingCriteria } from "@gac/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, companies, leadEvents, leads, sourcingRuns } from "../src/db/schema";
import type { FoundProspect, PollResult, SourcingProvider } from "../src/sourcing/provider";
import { RUN_TIMEOUT_MS, sourcingTick } from "../src/sourcing/service";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

class FakeProvider implements SourcingProvider {
  starts: SourcingCriteria[] = [];
  aborted: string[] = [];
  results: PollResult[] = [];
  failStart: string | null = null;
  async start(c: SourcingCriteria) {
    if (this.failStart) throw new Error(this.failStart);
    this.starts.push(c);
    return { providerRunId: `run-${this.starts.length}` };
  }
  async poll(): Promise<PollResult> {
    return this.results.shift() ?? { state: "running" };
  }
  async abort(id: string) {
    this.aborted.push(id);
  }
}

const criteria = (over: Partial<SourcingCriteria> = {}): SourcingCriteria => ({
  source: "google_maps",
  query: "Électricien",
  cities: ["Annecy", "Grenoble"],
  maxResults: 20,
  noWebsiteOnly: false,
  ...over,
});

const item = (n: string, over: Partial<FoundProspect> = {}): FoundProspect => ({
  companyName: n,
  phone: "04 50 11 22 33",
  city: "Annecy",
  sector: "Électricien",
  googleRating: 4.5,
  googleReviews: 20,
  ...over,
});

describe("sourcing : simuler, lancer, suivre, ajouter sans doublon", () => {
  let t: TestApp;
  const provider = new FakeProvider();
  beforeAll(async () => {
    t = await createTestApp(
      {
        SOURCING_MODE: "apify",
        APIFY_TOKEN: "jeton-de-test",
        SOURCING_COST_PER_RESULT: "0.05",
        SOURCING_DAILY_BUDGET: "3",
      },
      undefined,
      null,
      provider,
    );
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t);
    provider.starts = [];
    provider.aborted = [];
    provider.results = [];
    provider.failStart = null;
  });

  const call = (method: "GET" | "POST", url: string, cookie: string, payload?: object) =>
    t.app.inject({ method, url, headers: withOrigin(cookie), ...(payload ? { payload } : {}) });
  const asManager = async () => login(t, (await createUser(t, "MANAGER")).email);
  const launch = async (cookie: string, c = criteria()) => {
    const sim = (await call("POST", "/sourcing/runs", cookie, { criteria: c, dryRun: true })).json();
    return call("POST", "/sourcing/runs", cookie, {
      criteria: c,
      dryRun: false,
      expectedCost: sim.estimatedCost,
    });
  };
  const tick = (now?: Date) =>
    sourcingTick({ db: t.db, config: t.config, provider, ...(now ? { now: () => now } : {}) });

  it("réservé aux responsables", async () => {
    const agent = await login(t, (await createUser(t, "AGENT")).email);
    expect((await call("GET", "/sourcing/runs", agent)).statusCode).toBe(403);
    expect(
      (await call("POST", "/sourcing/runs", agent, { criteria: criteria(), dryRun: true })).statusCode,
    ).toBe(403);
  });

  it("simule le coût maximal et les doublons probables sans rien lancer", async () => {
    const m = await asManager();
    await t.db
      .insert(companies)
      .values({ name: "Déjà Là", nameKey: "deja la", city: "Annecy", sector: "Électricien" });
    const res = await call("POST", "/sourcing/runs", m, { criteria: criteria(), dryRun: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      dryRun: true,
      estimatedCost: 1,
      maxResults: 20,
      probableDuplicates: 1,
      dailyBudget: 3,
    });
    expect(await t.db.$count(sourcingRuns)).toBe(0);
    const tooMany = await call("POST", "/sourcing/runs", m, {
      criteria: criteria({ maxResults: 150 }),
      dryRun: true,
    });
    expect(tooMany.statusCode).toBe(400);
  });

  it("exige la simulation : coût différent refusé, plafond du jour respecté", async () => {
    const m = await asManager();
    const wrong = await call("POST", "/sourcing/runs", m, {
      criteria: criteria(),
      dryRun: false,
      expectedCost: 0.5,
    });
    expect(wrong.statusCode).toBe(409);
    const noCost = await call("POST", "/sourcing/runs", m, { criteria: criteria(), dryRun: false });
    expect(noCost.statusCode).toBe(409);
    expect((await launch(m)).statusCode).toBe(201); // 1 €
    expect((await launch(m)).statusCode).toBe(201); // 2 €
    expect((await launch(m)).statusCode).toBe(201); // 3 € : pile le plafond
    const over = await launch(m);
    expect(over.statusCode).toBe(409);
    expect(over.json().error.message).toMatch(/Plafond du jour/);
  });

  it("une recherche annulée libère son budget et prévient le fournisseur", async () => {
    const m = await asManager();
    const run = (await launch(m)).json();
    await tick(); // démarrage : le fournisseur connaît la recherche
    const cancelled = await call("POST", `/sourcing/runs/${run.id}/cancel`, m);
    expect(cancelled.json().state).toBe("cancelled");
    expect(provider.aborted).toEqual(["run-1"]);
    expect((await call("POST", `/sourcing/runs/${run.id}/cancel`, m)).statusCode).toBe(409);
    expect((await call("GET", "/sourcing/status", m)).json().spentToday).toBe(0);
  });

  it("suit l'état puis ajoute les prospects : France seulement, jamais de doublon, tout tracé", async () => {
    const m = await asManager();
    const [known] = await t.db
      .insert(companies)
      .values({ name: "Doublon Élec", nameKey: "doublon elec", phone: "+33450112233" })
      .returning({ id: companies.id });
    await t.db.insert(leads).values({ companyId: known?.id as string, source: "Import" });
    const run = (await launch(m)).json();
    expect(run.state).toBe("queued");
    provider.results = [
      { state: "running", progress: 40 },
      {
        state: "succeeded",
        cost: 0.35,
        items: [
          item("Alpha Électricité", { website: "https://www.alpha-elec.example" }),
          item("Bravo Électricité"),
          item("Doublon Élec"),
          item("Étranger SA", { phone: "+32 2 123 45 67" }),
          item("Sans Numéro", { phone: null }),
          item("Alpha Électricité", { website: "alpha-elec.example/contact" }),
        ],
      },
    ];
    await tick(); // démarre la recherche et lit un premier état
    let current = (await call("GET", "/sourcing/runs", m)).json().items[0];
    expect(current).toMatchObject({ state: "running", progress: 40 });
    await tick();
    current = (await call("GET", "/sourcing/runs", m)).json().items[0];
    expect(current).toMatchObject({
      state: "succeeded",
      found: 6,
      created: 2,
      duplicates: 2,
      rejected: 2,
      cost: 0.35,
    });
    expect(current.finishedAt).not.toBeNull();

    const created = await t.db.select().from(leads).where(eq(leads.source, "Sourcing · Google Maps"));
    expect(created).toHaveLength(2);
    for (const l of created) {
      expect(l).toMatchObject({ stage: "Nouveau", callState: "À appeler", source: "Sourcing · Google Maps" });
      const [ev] = await t.db.select().from(leadEvents).where(eq(leadEvents.leadId, l.id));
      expect(ev?.data).toMatchObject({ sourcingRunId: run.id });
    }
    expect(provider.starts).toHaveLength(1);
    const actions = (await t.db.select().from(auditEvents)).map((a) => a.action);
    expect(actions).toContain("sourcing.started");
    // le coût réel remplace l'estimation dans le budget du jour
    expect((await call("GET", "/sourcing/status", m)).json().spentToday).toBe(0.35);
  });

  it("« sans site web seulement » écarte les établissements qui en ont un", async () => {
    const m = await asManager();
    await launch(m, criteria({ noWebsiteOnly: true }));
    provider.results = [
      { state: "running" },
      { state: "succeeded", items: [item("Avec Site", { website: "avec-site.example" }), item("Sans Site")] },
    ];
    await tick();
    await tick();
    await tick();
    const [run] = await t.db.select().from(sourcingRuns);
    expect(run).toMatchObject({ state: "succeeded", created: 1, rejected: 1 });
  });

  it("deux cycles simultanés ne lancent la recherche qu'une fois", async () => {
    const m = await asManager();
    await launch(m);
    await Promise.all([tick(), tick(), tick()]);
    expect(provider.starts).toHaveLength(1);
  });

  it("un échec du fournisseur est visible, sans jeton ni donnée dans le message", async () => {
    const m = await asManager();
    await launch(m);
    provider.failStart = "quota Apify atteint";
    await tick();
    const [run] = await t.db.select().from(sourcingRuns);
    expect(run).toMatchObject({ state: "failed", error: "quota Apify atteint" });
    // refusée avant de démarrer chez le fournisseur : rien n'a été dépensé
    expect((await call("GET", "/sourcing/status", m)).json().spentToday).toBe(0);
  });

  it("abandonne une recherche qui dépasse le délai maximal", async () => {
    const m = await asManager();
    await launch(m);
    await tick();
    const later = new Date(Date.now() + RUN_TIMEOUT_MS + 60_000);
    await tick(later);
    const [run] = await t.db.select().from(sourcingRuns);
    expect(run?.state).toBe("failed");
    expect(run?.error).toMatch(/Délai dépassé/);
    expect(provider.aborted).toEqual(["run-1"]);
  });
});

describe("sourcing désactivé", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  it("simule mais refuse de lancer", async () => {
    await resetDb(t);
    const m = await login(t, (await createUser(t, "MANAGER")).email);
    const c = {
      source: "google_maps",
      query: "Plombier",
      cities: ["Lyon"],
      maxResults: 10,
      noWebsiteOnly: false,
    };
    const h = withOrigin(m);
    expect(
      (
        await t.app.inject({
          method: "POST",
          url: "/sourcing/runs",
          headers: h,
          payload: { criteria: c, dryRun: true },
        })
      ).statusCode,
    ).toBe(200);
    const res = await t.app.inject({
      method: "POST",
      url: "/sourcing/runs",
      headers: h,
      payload: { criteria: c, dryRun: false, expectedCost: 0.2 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/désactivé/);
    expect((await t.app.inject({ method: "GET", url: "/sourcing/status", headers: h })).json()).toMatchObject(
      { mode: "off" },
    );
  });
});
