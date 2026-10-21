import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { companies, leadEvents } from "../src/db/schema";
import {
  classifyRegistry,
  type RegistryFetcher,
  type RegistryHit,
  registryKey,
} from "../src/enrich/registry";
import { importAirtableCsv } from "../src/import/airtable";
import { runRegistryCheck } from "../src/modules/leads/registry-check";
import { type AirtableRow, linkedinRow, toCsv } from "./fixtures/airtable-csv";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

const hit = (over: Partial<RegistryHit> & { names: string[] }): RegistryHit => ({
  siren: "123456789",
  city: "PARIS",
  active: true,
  closedOn: null,
  ...over,
});

describe("registre : décision active / fermée / à confirmer", () => {
  it("ignore la forme juridique, la casse, les accents et la ponctuation", () => {
    expect(registryKey("Vapoclope Sarl")).toBe(registryKey("VAPOCLOPE"));
    expect(registryKey("Pose Ta Dem'")).toBe(registryKey("POSE TA  DEM'"));
    expect(registryKey("Rosaé Paris")).toBe("rosaeparis");
  });

  it("une société active du même nom l'emporte sur une homonyme fermée", () => {
    const out = classifyRegistry({ name: "Veepee", city: "Saint-Denis" }, [
      hit({ names: ["VEEPEE STORE"], active: false, closedOn: "2024-12-20", city: "SAINT-DENIS" }),
      hit({ names: ["VEEPEE"], siren: "111111111", city: "SAINT-DENIS" }),
    ]);
    expect(out).toEqual({ status: "active", siren: "111111111" });
  });

  it("nom identique et même ville, rien d'actif : fermée", () => {
    const out = classifyRegistry({ name: "Pose Ta Dem'", city: "Paris" }, [
      hit({ names: ["POSE TA  DEM'"], active: false, closedOn: "2026-03-27" }),
    ]);
    expect(out).toEqual({ status: "closed", siren: "123456789", closedOn: "2026-03-27" });
  });

  it("ville différente ou nom différent : à confirmer, jamais fermée d'office", () => {
    const otherCity = classifyRegistry({ name: "Mondassur", city: "Boulogne-Billancourt" }, [
      hit({ names: ["MONDASSUR"], active: false, closedOn: "1997-09-17", city: "CERGY" }),
    ]);
    expect(otherCity.status).toBe("to_confirm");
    const otherName = classifyRegistry({ name: "Wisetax", city: "Marseille" }, [
      hit({ names: ["SYLVAIN LORMAN (WISETAX FORMATION)"], active: false, city: "MARSEILLE" }),
    ]);
    expect(otherName.status).toBe("to_confirm");
  });

  it("ville inconnue du lead : à confirmer", () => {
    const out = classifyRegistry({ name: "Axe Conseil", city: null }, [
      hit({ names: ["AXE CONSEIL"], active: false, closedOn: "2020-01-01" }),
    ]);
    expect(out.status).toBe("to_confirm");
  });

  it("aucune société correspondante : rien n'est marqué", () => {
    expect(
      classifyRegistry({ name: "Marque Inconnue", city: "Lyon" }, [hit({ names: ["AUTRE CHOSE"] })]),
    ).toEqual({
      status: "not_found",
    });
    expect(classifyRegistry({ name: "Sarl", city: null }, [])).toEqual({ status: "not_found" });
  });
});

describe("registre : contrôle des entreprises du CRM", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const li = (name: string, over: AirtableRow = {}): AirtableRow =>
    linkedinRow({
      Entreprise: name,
      "Site web": `${name.toLowerCase().replace(/\W/g, "")}.fr`,
      Email: `${name.toLowerCase().replace(/\W/g, "")}@exemple-test.fr`,
      Prénom: name,
      Linkedin: `https://l/${name}`,
      Ville: "Paris",
      ...over,
    });
  const seed = (rows: AirtableRow[]) => importAirtableCsv(t.db, toCsv(rows));
  const login_ = async (role: "ADMIN" | "MANAGER" | "AGENT" | "VIEWER") => {
    const u = await createUser(t, role);
    return { ...u, cookie: await login(t, u.email) };
  };
  const call = (method: "GET" | "POST", url: string, c?: string, payload?: object) =>
    t.app.inject({ method, url, payload, headers: withOrigin(c) });

  const registry: Record<string, RegistryHit[]> = {
    Fermee: [hit({ names: ["FERMEE"], active: false, closedOn: "2026-05-23" })],
    Douteuse: [hit({ names: ["DOUTEUSE"], active: false, closedOn: "2019-12-31", city: "CERGY" })],
    Vivante: [hit({ names: ["VIVANTE"] })],
  };
  const fetcher: RegistryFetcher = async (name) => {
    if (name === "Panne") throw new Error("réseau");
    return registry[name] ?? [];
  };

  const run = async () => {
    const admin = await createUser(t, "ADMIN");
    return runRegistryCheck(t.db, { limit: 50, actorId: admin.id, fetcher });
  };
  const idOf = async (c: string, q: string) =>
    (await call("GET", `/leads?q=${encodeURIComponent(q)}`, c)).json().items[0].id as string;

  it("marque les fermées sans rien supprimer, laisse les inconnues et trace dans l'historique", async () => {
    await seed([li("Fermee"), li("Douteuse"), li("Vivante"), li("Marque")]);
    const res = await run();
    expect(res).toMatchObject({
      checked: 4,
      active: 1,
      closed: 1,
      toConfirm: 1,
      notFound: 1,
      failed: 0,
      remaining: 0,
    });

    const status = Object.fromEntries(
      (await t.db.select().from(companies)).map((c) => [c.name, [c.registryStatus, c.registryClosedOn]]),
    );
    expect(status.Fermee).toEqual(["closed", "2026-05-23"]);
    expect(status.Douteuse?.[0]).toBe("to_confirm");
    expect(status.Vivante?.[0]).toBe("active");
    expect(status.Marque?.[0]).toBeNull();

    const events = await t.db.select().from(leadEvents).where(eq(leadEvents.type, "company_registry"));
    expect(events).toHaveLength(2); // une fermée + une à confirmer
    expect(await t.db.select().from(companies)).toHaveLength(4); // aucune suppression
  });

  it("une panne du registre laisse l'entreprise à recontrôler", async () => {
    await seed([li("Panne")]);
    const res = await run();
    expect(res).toMatchObject({ checked: 0, failed: 1, remaining: 1 });
  });

  it("ne recontrôle pas avant un mois ni une fermeture déjà constatée", async () => {
    await seed([li("Fermee"), li("Vivante")]);
    await run();
    expect(await run()).toMatchObject({ checked: 0, remaining: 0 });
  });

  it("la liste de travail masque les fermées ; la section « fermées » les montre avec les à confirmer", async () => {
    await seed([li("Fermee"), li("Douteuse"), li("Vivante")]);
    await run();
    const m = await login_("VIEWER");
    const names = async (q: string) =>
      (await call("GET", `/leads?${q}`, m.cookie))
        .json()
        .items.map((i: { company: { name: string } }) => i.company.name)
        .sort();
    expect(await names("registry=open")).toEqual(["Douteuse", "Vivante"]);
    expect(await names("registry=closed")).toEqual(["Douteuse", "Fermee"]);
    expect(await names("registry=confirmed")).toEqual(["Fermee"]);
    expect(await names("registry=to_confirm")).toEqual(["Douteuse"]);
    expect(await names("")).toEqual(["Douteuse", "Fermee", "Vivante"]); // sans filtre : comportement inchangé

    const facets = (await call("GET", "/leads/facets", m.cookie)).json();
    expect(facets.registry).toEqual({ closed: 1, to_confirm: 1, active: 1 });
    const item = (await call("GET", "/leads?registry=confirmed", m.cookie)).json().items[0];
    expect(item.company).toMatchObject({ registryStatus: "closed", registryClosedOn: "2026-05-23" });
  });

  it("une personne tranche : confirmer ou déclarer en activité, et le contrôle automatique n'y touche plus", async () => {
    await seed([li("Douteuse")]);
    await run();
    const m = await login_("MANAGER");
    const id = await idOf(m.cookie, "Douteuse");

    const confirmed = await call("POST", `/leads/${id}/registry`, m.cookie, { decision: "confirm" });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().company.registryStatus).toBe("closed");

    const dismissed = await call("POST", `/leads/${id}/registry`, m.cookie, { decision: "dismiss" });
    expect(dismissed.json().company.registryStatus).toBe("active");

    await t.db.update(companies).set({ registryCheckedAt: null }); // périme le contrôle
    expect(await run()).toMatchObject({ checked: 0 }); // tranché à la main : plus recontrôlée
    expect((await t.db.select().from(companies))[0]?.registryStatus).toBe("active");
  });

  it("réserve le contrôle et les décisions aux responsables", async () => {
    await seed([li("Douteuse")]);
    const agent = await login_("AGENT");
    const id = await idOf(agent.cookie, "Douteuse");
    expect((await call("POST", "/leads/registry-check", agent.cookie, {})).statusCode).toBe(403);
    expect(
      (await call("POST", `/leads/${id}/registry`, agent.cookie, { decision: "confirm" })).statusCode,
    ).toBe(403);
    expect((await call("POST", `/leads/${id}/registry`, undefined, { decision: "confirm" })).statusCode).toBe(
      401,
    );
    expect(
      (await call("POST", `/leads/${id}/registry`, (await login_("MANAGER")).cookie, { decision: "x" }))
        .statusCode,
    ).toBe(400);
  });
});
