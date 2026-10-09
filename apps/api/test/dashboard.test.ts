import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { importAirtableCsv } from "../src/import/airtable";
import { type AirtableRow, linkedinRow, mapsRow, toCsv } from "./fixtures/airtable-csv";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

/** Date de détection il y a `days` jours (en milieu de journée, pour éviter les effets de fuseau). */
const ago = (days: number) => {
  const d = new Date(Date.now() - days * 86_400_000);
  return `${d.toISOString().slice(0, 11)}12:00:00.000-04:00`;
};

describe("tableau de bord", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const lead = (name: string, over: AirtableRow): AirtableRow =>
    linkedinRow({
      Entreprise: name,
      "Site web": `${name.toLowerCase()}.fr`,
      Email: `${name.toLowerCase()}@${name.toLowerCase()}.fr`,
      "Étape pipeline": "",
      ...over,
    });
  const seed = () =>
    importAirtableCsv(
      t.db,
      toCsv([
        lead("Alpha", {
          Qualification: "Chaud",
          "Validation mail": "Pas Validé",
          "Statut email": "",
          "Email envoyé le": "",
          "Date détection": ago(2),
          Secteur: "Retail",
        }),
        lead("Bravo", {
          Qualification: "Chaud",
          "Validation mail": "Validé",
          "Date détection": ago(20),
          Secteur: "Retail",
          "Étape pipeline": "Gagné",
        }),
        lead("Charlie", {
          Qualification: "Tiède",
          "Validation mail": "Validé",
          "Date détection": ago(60),
          Secteur: "Insurance",
          "Étape pipeline": "Contacté",
        }),
        lead("Delta", {
          Qualification: "Froid",
          "Validation mail": "Pas Validé",
          "Statut email": "",
          "Email envoyé le": "",
          "Date détection": ago(200),
          Secteur: "",
        }),
        mapsRow({ Entreprise: "Maps", "Date détection": ago(1) }),
      ]),
    );
  const dash = async (qs = "", role: "VIEWER" | "AGENT" = "VIEWER") => {
    const c = await login(t, (await createUser(t, role)).email);
    return t.app.inject({ method: "GET", url: `/dashboard${qs}`, headers: withOrigin(c) });
  };

  it("exige une session", async () => {
    expect((await t.app.inject({ method: "GET", url: "/dashboard", headers: withOrigin() })).statusCode).toBe(
      401,
    );
  });

  it("calcule les indicateurs sur toute la période", async () => {
    await seed();
    const d = (await dash()).json();
    expect(d.kpis).toMatchObject({
      leads: 5,
      qualified: 3,
      emailsValidated: 2,
      toCall: 1,
      won: 1,
      activePipeline: 1,
    });
    expect(d.qualification).toMatchObject({ Chaud: 2, Tiède: 1, Froid: 1, "Non qualifié": 1 });
    expect(d.pipeline.map((p: { stage: string }) => p.stage)).toEqual(["Contacté", "Gagné"]);
    expect(d.sectors[0]).toEqual({ label: "Retail", count: 2 });
    expect(d.sectors.at(-1).label).toBe("Non renseigné");
  });

  it("filtre par période : 7 jours, 30 jours, plage personnalisée ; sans date = exclu", async () => {
    await seed();
    expect((await dash("?period=7")).json().kpis.leads).toBe(2); // Alpha et Maps
    expect((await dash("?period=30")).json().kpis.leads).toBe(3);
    const from = ago(25).slice(0, 10);
    const to = ago(15).slice(0, 10);
    const custom = (await dash(`?period=custom&from=${from}&to=${to}`)).json();
    expect(custom.kpis.leads).toBe(1);
    expect(custom.recent).toHaveLength(1);
    expect(custom.recent[0].company.name).toBe("Bravo");
  });

  it("liste les leads chauds à valider et les 8 plus récents", async () => {
    await seed();
    const d = (await dash()).json();
    expect(d.priority.map((l: { company: { name: string } }) => l.company.name)).toEqual(["Alpha"]);
    expect(d.recent.map((l: { company: { name: string } }) => l.company.name).slice(0, 2)).toEqual([
      "Maps",
      "Alpha",
    ]);
  });

  it("refuse une période personnalisée incomplète ou inversée", async () => {
    expect((await dash("?period=custom")).statusCode).toBe(400);
    expect((await dash("?period=custom&from=2026-10-10&to=2026-10-01")).statusCode).toBe(400);
    expect((await dash("?period=45")).statusCode).toBe(400);
  });
});
