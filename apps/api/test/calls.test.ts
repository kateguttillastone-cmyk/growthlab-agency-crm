import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { importAirtableCsv } from "../src/import/airtable";
import { type AirtableRow, mapsRow, toCsv } from "./fixtures/airtable-csv";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

describe("file d'appel", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const seed = (rows: AirtableRow[]) => importAirtableCsv(t.db, toCsv(rows));
  const as = async (role: "ADMIN" | "MANAGER" | "AGENT" | "VIEWER") =>
    login(t, (await createUser(t, role)).email);
  const get = (url: string, c: string) => t.app.inject({ method: "GET", url, headers: withOrigin(c) });
  const call = (id: string, c: string, payload: object) =>
    t.app.inject({ method: "POST", url: `/leads/${id}/call`, payload, headers: withOrigin(c) });
  const biz = (name: string, city: string, phone: string): AirtableRow =>
    mapsRow({ Entreprise: name, Ville: city, Téléphone: phone });
  const idOf = async (c: string, q: string) =>
    (await get(`/leads?q=${encodeURIComponent(q)}`, c)).json().items[0].id as string;
  const queue = async (c: string, extra = "") =>
    (await get(`/leads?callState=${encodeURIComponent("À appeler")}&sort=calls&order=asc${extra}`, c)).json();

  it("est réservé aux agents et plus (pas aux lecteurs)", async () => {
    await seed([biz("Alpha", "Lyon", "04 11 22 33 01")]);
    const viewer = await as("VIEWER");
    const id = await idOf(viewer, "Alpha");
    expect((await call(id, viewer, { outcome: "NRP" })).statusCode).toBe(403);
    expect((await call(id, await as("AGENT"), { outcome: "NRP" })).statusCode).toBe(200);
  });

  it("trois absences de réponse rendent le prospect injoignable ; les cases se remplissent dans l'ordre", async () => {
    await seed([biz("Alpha", "Lyon", "04 11 22 33 01")]);
    const c = await as("AGENT");
    const id = await idOf(c, "Alpha");
    const a = (await call(id, c, { outcome: "NRP" })).json();
    expect(a).toMatchObject({ callStatus: "NRP", callState: "À appeler", stage: "Contacté" });
    const b = (await call(id, c, { outcome: "REPONDEUR" })).json();
    expect(b).toMatchObject({ followup1: "REPONDEUR", callState: "À appeler" });
    const d = (await call(id, c, { outcome: "NRP", note: "Tel. sonne dans le vide" })).json();
    expect(d).toMatchObject({ followup2: "NRP", callState: "Injoignable" });
    expect(d.comment).toContain("Tel. sonne dans le vide");
    expect(d.comment.split("\n")).toHaveLength(3);
    expect(d.events.some((e: { type: string; data: { to?: string } }) => e.type === "stage_changed")).toBe(
      true,
    );
  });

  it("rendez-vous, refus, mauvais numéro et rappel sortent de la file avec la bonne étape", async () => {
    await seed([
      biz("Rdv", "Lyon", "04 11 22 33 01"),
      biz("Refus", "Lyon", "04 11 22 33 02"),
      biz("Faux", "Lyon", "04 11 22 33 03"),
      biz("Rappel", "Lyon", "04 11 22 33 04"),
    ]);
    const c = await as("AGENT");
    const run = async (name: string, outcome: string) =>
      (await call(await idOf(c, name), c, { outcome })).json();
    expect(await run("Rdv", "RDV fixé")).toMatchObject({ callState: "RDV fixé", stage: "RDV programmé" });
    expect(await run("Refus", "PI")).toMatchObject({ callState: "Pas intéressé", stage: "Perdu" });
    expect(await run("Faux", "PB NUMERO")).toMatchObject({ callState: "Injoignable" });
    expect(await run("Rappel", "A RAP")).toMatchObject({ callState: "Répondu" });
    expect((await queue(c)).total).toBe(0);
  });

  it("ne fait jamais reculer l'étape et conserve le commentaire existant", async () => {
    await seed([biz("Alpha", "Lyon", "04 11 22 33 01")]);
    const c = await as("AGENT");
    const id = await idOf(c, "Alpha");
    await call(id, c, { outcome: "RDV fixé" });
    const after = (await call(id, c, { outcome: "NRP" })).json();
    expect(after.stage).toBe("RDV programmé");
    expect(after.comment.split("\n")).toHaveLength(2);
  });

  it("deux appels simultanés remplissent deux cases différentes", async () => {
    await seed([biz("Alpha", "Lyon", "04 11 22 33 01")]);
    const c = await as("AGENT");
    const id = await idOf(c, "Alpha");
    await Promise.all([call(id, c, { outcome: "NRP" }), call(id, c, { outcome: "REPONDEUR" })]);
    const lead = (await get(`/leads/${id}`, c)).json();
    expect([lead.callStatus, lead.followup1].sort()).toEqual(["NRP", "REPONDEUR"]);
  });

  it("la file place les jamais-appelés d'abord, groupés par ville, et filtre ville et téléphone", async () => {
    await seed([
      biz("Zeta", "Lyon", "04 11 22 33 01"),
      biz("Beta", "Annecy", "04 11 22 33 02"),
      biz("Alpha", "Lyon", "04 11 22 33 03"),
      mapsRow({ Entreprise: "Sans tel", Ville: "Lyon", Téléphone: "" }),
    ]);
    const c = await as("AGENT");
    await call(await idOf(c, "Beta"), c, { outcome: "NRP" }); // Beta passe après les jamais-appelés
    const names = (await queue(c)).items.map((i: { company: { name: string } }) => i.company.name);
    expect(names).toEqual(["Alpha", "Sans tel", "Zeta", "Beta"]);
    const phoned = (await queue(c, "&hasPhone=true")).items.map(
      (i: { company: { name: string } }) => i.company.name,
    );
    expect(phoned).not.toContain("Sans tel");
    const lyon = (await queue(c, "&city=lyo")).items.map(
      (i: { company: { name: string } }) => i.company.name,
    );
    expect(lyon).toEqual(["Alpha", "Sans tel", "Zeta"]);
  });

  it("refuse une issue inconnue", async () => {
    await seed([biz("Alpha", "Lyon", "04 11 22 33 01")]);
    const c = await as("AGENT");
    expect((await call(await idOf(c, "Alpha"), c, { outcome: "Peut-être" })).statusCode).toBe(400);
  });
});
