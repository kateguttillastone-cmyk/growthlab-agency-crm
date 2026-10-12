import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, leadEvents, leads, savedViews } from "../src/db/schema";
import { importAirtableCsv } from "../src/import/airtable";
import { csvCell } from "../src/modules/leads/export-views";
import { type AirtableRow, linkedinRow, mapsRow, toCsv } from "./fixtures/airtable-csv";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

describe("leads : tableau du pipeline, actions groupées, création, export, vues", () => {
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
      "Étape pipeline": "",
      ...over,
    });
  const seed = (rows: AirtableRow[]) => importAirtableCsv(t.db, toCsv(rows));
  const login_ = async (role: "ADMIN" | "MANAGER" | "AGENT" | "VIEWER") => {
    const u = await createUser(t, role);
    return { ...u, cookie: await login(t, u.email) };
  };
  const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, c?: string, payload?: object) =>
    t.app.inject({ method, url, payload, headers: withOrigin(c) });
  const idOf = async (c: string, q: string) =>
    (await call("GET", `/leads?q=${encodeURIComponent(q)}`, c)).json().items[0].id as string;

  describe("choix du responsable", () => {
    it("liste les comptes actifs, pour les responsables seulement", async () => {
      const m = await login_("MANAGER");
      await createUser(t, "AGENT", { name: "Zoé Agent" });
      await createUser(t, "AGENT", { name: "Inactif", active: false });
      const res = await call("GET", "/users/options", m.cookie);
      const names = res.json().map((u: { name: string }) => u.name);
      expect(names).toContain("Zoé Agent");
      expect(names).not.toContain("Inactif");
      expect(JSON.stringify(res.json())).not.toContain("@"); // aucune adresse
      expect((await call("GET", "/users/options", (await login_("AGENT")).cookie)).statusCode).toBe(403);
    });
  });

  describe("tableau du pipeline", () => {
    const board = () =>
      seed([
        li("Alpha", { "Étape pipeline": "Contacté", Qualification: "Chaud" }),
        li("Bravo", { "Étape pipeline": "Contacté", Qualification: "Froid" }),
        li("Charlie", { "Étape pipeline": "RDV programmé", Qualification: "Chaud" }),
        li("Delta", { "Étape pipeline": "Gagné" }),
        li("Echo", {}),
        mapsRow({ Entreprise: "Sans etape" }),
      ]);

    it("renvoie les 9 colonnes dans l'ordre, avec effectifs, valeurs et leads sans étape", async () => {
      await board();
      await t.db.update(leads).set({ dealValue: 1500 }).where(eq(leads.stage, "Contacté"));
      const v = await login_("VIEWER");
      const res = (await call("GET", "/pipeline", v.cookie)).json();
      expect(res.stages.map((s: { stage: string }) => s.stage)).toEqual([
        "Nouveau",
        "Contacté",
        "Répondu",
        "RDV programmé",
        "RDV effectué",
        "Proposition envoyée",
        "Négociation",
        "Gagné",
        "Perdu",
      ]);
      const by = (s: string) => res.stages.find((x: { stage: string }) => x.stage === s);
      expect(by("Contacté")).toMatchObject({ count: 2, value: 3000 });
      expect(by("Contacté").items).toHaveLength(2);
      expect(by("RDV programmé").count).toBe(1);
      expect(by("Perdu")).toMatchObject({ count: 0, value: 0, items: [] });
      expect(res.unstaged).toBe(2);
    });

    it("limite les cartes par colonne, donne la suite, et applique les filtres", async () => {
      await seed(
        Array.from({ length: 5 }, (_, i) =>
          li(`Societe${i}`, { "Étape pipeline": "Contacté", Qualification: i < 3 ? "Chaud" : "Froid" }),
        ),
      );
      const v = await login_("VIEWER");
      const first = (await call("GET", "/pipeline?perStage=2", v.cookie))
        .json()
        .stages.find((s: { stage: string }) => s.stage === "Contacté");
      expect(first).toMatchObject({ count: 5 });
      expect(first.items).toHaveLength(2);
      const more = (await call("GET", "/pipeline/Contact%C3%A9?offset=2&limit=10", v.cookie)).json();
      expect(more.total).toBe(5);
      expect(more.items).toHaveLength(3);
      const ids = new Set([...first.items, ...more.items].map((l: { id: string }) => l.id));
      expect(ids.size).toBe(5); // aucune carte en double entre les deux pages
      const chaud = (await call("GET", "/pipeline?qualification=Chaud", v.cookie))
        .json()
        .stages.find((s: { stage: string }) => s.stage === "Contacté");
      expect(chaud.count).toBe(3);
      expect((await call("GET", "/pipeline/Inconnue", v.cookie)).statusCode).toBe(400);
    });

    it("un déplacement (PATCH de l'étape) se retrouve dans le tableau et dans l'historique", async () => {
      await board();
      const a = await login_("AGENT");
      const id = await idOf(a.cookie, "Alpha");
      expect((await call("PATCH", `/leads/${id}`, a.cookie, { stage: "Répondu" })).statusCode).toBe(200);
      const res = (await call("GET", "/pipeline", a.cookie)).json();
      expect(res.stages.find((s: { stage: string }) => s.stage === "Répondu").items[0].company.name).toBe(
        "Alpha",
      );
      expect(res.stages.find((s: { stage: string }) => s.stage === "Contacté").count).toBe(1);
      expect(await t.db.$count(leadEvents, eq(leadEvents.type, "stage_changed"))).toBe(1);
    });

    it("filtre par responsable (y compris « sans responsable ») et expose ownerId", async () => {
      await board();
      const m = await login_("MANAGER");
      const id = await idOf(m.cookie, "Alpha");
      await call("PATCH", `/leads/${id}`, m.cookie, { ownerId: m.id });
      const mine = (await call("GET", `/pipeline?owner=${m.id}`, m.cookie)).json();
      expect(mine.stages.flatMap((s: { items: unknown[] }) => s.items)).toHaveLength(1);
      const none = (await call("GET", "/pipeline?owner=none", m.cookie)).json();
      expect(none.stages.flatMap((s: { items: unknown[] }) => s.items).length).toBe(3);
      expect((await call("GET", `/leads/${id}`, m.cookie)).json().ownerId).toBe(m.id);
      expect((await call("GET", `/leads?owner=${m.id}`, m.cookie)).json().total).toBe(1);
    });
  });

  describe("actions groupées", () => {
    const four = () =>
      seed([
        li("Alpha", { Qualification: "Chaud" }),
        li("Bravo", { Qualification: "Chaud" }),
        li("Charlie", { Qualification: "Froid" }),
        li("Delta", { Qualification: "Chaud" }),
      ]);

    it("simule sans rien modifier, puis applique avec l'effectif simulé ; historique et audit", async () => {
      await four();
      const m = await login_("MANAGER");
      const body = { filter: { qualification: "Chaud" }, set: { qualification: "Tiède" } };
      const dry = (await call("POST", "/leads/bulk", m.cookie, { ...body, dryRun: true })).json();
      expect(dry).toEqual({ dryRun: true, matched: 3, changed: 3, unchanged: 0 });
      expect(await t.db.$count(leads, eq(leads.qualification, "Tiède"))).toBe(0);
      expect((await call("POST", "/leads/bulk", m.cookie, body)).statusCode).toBe(400); // pas de simulation préalable
      expect((await call("POST", "/leads/bulk", m.cookie, { ...body, expectedCount: 2 })).statusCode).toBe(
        409,
      );
      const done = (await call("POST", "/leads/bulk", m.cookie, { ...body, expectedCount: 3 })).json();
      expect(done).toEqual({ dryRun: false, matched: 3, changed: 3, unchanged: 0 });
      expect(await t.db.$count(leads, eq(leads.qualification, "Tiède"))).toBe(3);
      const ev = await t.db.select().from(leadEvents).where(eq(leadEvents.type, "field_changed"));
      expect(ev).toHaveLength(3);
      expect(ev[0]?.data).toMatchObject({ field: "qualification", from: "Chaud", to: "Tiède", bulk: true });
      expect(await t.db.$count(auditEvents, eq(auditEvents.action, "leads.bulk_update"))).toBe(1);
    });

    it("cible des lignes choisies ; ceux qui sont déjà dans l'état demandé ne changent pas", async () => {
      await four();
      const m = await login_("MANAGER");
      const ids = [await idOf(m.cookie, "Alpha"), await idOf(m.cookie, "Charlie")];
      const res = (
        await call("POST", "/leads/bulk", m.cookie, {
          ids,
          set: { qualification: "Froid" },
          expectedCount: 1,
        })
      ).json();
      expect(res).toEqual({ dryRun: false, matched: 2, changed: 1, unchanged: 1 });
      expect(await t.db.$count(leadEvents, eq(leadEvents.type, "field_changed"))).toBe(1);
      expect(
        (
          await call("POST", "/leads/bulk", m.cookie, {
            ids,
            filter: {},
            set: { stage: "Contacté" },
            dryRun: true,
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (await call("POST", "/leads/bulk", m.cookie, { set: { stage: "Contacté" }, dryRun: true }))
          .statusCode,
      ).toBe(400);
      expect((await call("POST", "/leads/bulk", m.cookie, { ids, set: {}, dryRun: true })).statusCode).toBe(
        400,
      );
    });

    it("applique les droits champ par champ : un agent change l'étape et la file d'appel, pas la qualification ni le responsable", async () => {
      await four();
      const a = await login_("AGENT");
      const ids = [await idOf(a.cookie, "Alpha")];
      expect(
        (await call("POST", "/leads/bulk", a.cookie, { ids, set: { qualification: "Froid" }, dryRun: true }))
          .statusCode,
      ).toBe(403);
      expect(
        (await call("POST", "/leads/bulk", a.cookie, { ids, set: { ownerId: a.id }, dryRun: true }))
          .statusCode,
      ).toBe(403);
      const ok = await call("POST", "/leads/bulk", a.cookie, {
        ids,
        set: { stage: "Contacté", callState: "Injoignable" },
        expectedCount: 1,
      });
      expect(ok.statusCode).toBe(200);
      expect(
        (await login_("VIEWER")).cookie &&
          (
            await call("POST", "/leads/bulk", (await login_("VIEWER")).cookie, {
              ids,
              set: { stage: "Perdu" },
              dryRun: true,
            })
          ).statusCode,
      ).toBe(403);
      expect(await t.db.$count(leadEvents, eq(leadEvents.type, "stage_changed"))).toBe(1);
    });

    it("refuse un responsable inexistant ou désactivé, et accepte d'effacer une valeur (null)", async () => {
      await four();
      const m = await login_("MANAGER");
      const off = await createUser(t, "AGENT", { active: false });
      const ids = [await idOf(m.cookie, "Alpha")];
      expect(
        (await call("POST", "/leads/bulk", m.cookie, { ids, set: { ownerId: off.id }, dryRun: true }))
          .statusCode,
      ).toBe(409);
      const res = (
        await call("POST", "/leads/bulk", m.cookie, { ids, set: { qualification: null }, expectedCount: 1 })
      ).json();
      expect(res.changed).toBe(1);
      expect(await t.db.$count(leads, eq(leads.qualification, "Chaud"))).toBe(2);
    });
  });

  describe("création manuelle", () => {
    const create = (c: string, payload: object) => call("POST", "/leads", c, payload);

    it("crée entreprise, contact et lead, normalise, et trace la création", async () => {
      const a = await login_("AGENT");
      const res = await create(a.cookie, {
        companyName: "Boulangerie Éclair",
        website: "https://www.eclair-test.fr/accueil",
        phone: "04 11 22 33 44",
        city: "Lyon",
        firstName: "Léa",
        lastName: "Durand",
        email: "Lea.Durand@Eclair-Test.fr",
      });
      expect(res.statusCode).toBe(201);
      const lead = res.json();
      expect(lead).toMatchObject({ source: "Saisie manuelle", qualification: null, stage: null });
      expect(lead.company).toMatchObject({
        name: "Boulangerie Éclair",
        domain: "eclair-test.fr",
        phone: "+33411223344",
      });
      expect(lead.contact).toMatchObject({ email: "lea.durand@eclair-test.fr", firstName: "Léa" });
      expect((await call("GET", `/leads?q=eclair`, a.cookie)).json().total).toBe(1);
      expect(lead.events.some((e: { type: string }) => e.type === "created")).toBe(true);
    });

    it("ne duplique jamais : même e-mail, même site, même entreprise sans site ; renvoie le lead existant", async () => {
      const a = await login_("AGENT");
      const first = (
        await create(a.cookie, { companyName: "Alpha", website: "alpha-test.fr", email: "x@alpha-test.fr" })
      ).json();
      const sameEmail = await create(a.cookie, { companyName: "Autre nom", email: "x@alpha-test.fr" });
      expect(sameEmail.statusCode).toBe(409);
      expect(sameEmail.json().error.details).toEqual({ leadId: first.id });
      // même site, autre personne : un nouveau lead dans la même entreprise
      const other = await create(a.cookie, {
        companyName: "Alpha",
        website: "https://alpha-test.fr",
        email: "y@alpha-test.fr",
      });
      expect(other.statusCode).toBe(201);
      expect(other.json().company.id).toBe(first.company.id);
      // entreprise sans site ni contact : une seule fois
      const m1 = await create(a.cookie, { companyName: "Atelier sans site", phone: "04 11 22 33 55" });
      expect(m1.statusCode).toBe(201);
      const m2 = await create(a.cookie, { companyName: "ATELIER sans site", phone: "0411223355" });
      expect(m2.statusCode).toBe(409);
      expect(await t.db.$count(leads)).toBe(3);
    });

    it("réserve qualification et service aux responsables, et refuse les valeurs illisibles", async () => {
      const a = await login_("AGENT");
      const m = await login_("MANAGER");
      expect((await create(a.cookie, { companyName: "X", qualification: "Chaud" })).statusCode).toBe(403);
      expect(
        (await create(m.cookie, { companyName: "Chaud SARL", qualification: "Chaud", service: "Google Ads" }))
          .statusCode,
      ).toBe(201);
      for (const bad of [
        { website: "pas un site" },
        { phone: "abc" },
        { email: "pas-un-email" },
        { companyName: "!!!" },
        { companyName: "" },
      ]) {
        expect(
          (await create(a.cookie, { companyName: "Valide", ...bad })).statusCode,
          JSON.stringify(bad),
        ).toBe(400);
      }
      expect((await create((await login_("VIEWER")).cookie, { companyName: "Z" })).statusCode).toBe(403);
    });
  });

  describe("export CSV", () => {
    it("exporte la liste filtrée au format d'Excel français, sans injection de formule, avec audit", async () => {
      await seed([
        li("Alpha", { Qualification: "Chaud", Téléphone: "01 23 45 67 89" }),
        li("=cmd|' /C calc'!A0", { Qualification: "Chaud" }),
        li("Charlie", { Qualification: "Froid" }),
      ]);
      const m = await login_("MANAGER");
      const res = await call("GET", "/leads/export?qualification=Chaud&sort=company&order=asc", m.cookie);
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toMatch(
        /attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"/,
      );
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body.startsWith('﻿"Entreprise";"Site web"')).toBe(true);
      const lines = res.body.trim().split("\r\n");
      expect(lines).toHaveLength(3); // en-tête + 2 chauds
      expect(res.body).toContain(`"'=cmd|' /C calc'!A0"`); // formule neutralisée
      expect(res.body).toContain('"01 23 45 67 89"'); // téléphone à la française
      expect(res.body).not.toContain("Charlie");
      const audit = await t.db.select().from(auditEvents).where(eq(auditEvents.action, "leads.export"));
      expect(audit).toHaveLength(1);
      expect(audit[0]?.data).toMatchObject({ rows: 2 });
      expect((await call("GET", "/leads/export", (await login_("AGENT")).cookie)).statusCode).toBe(403);
    });

    it("neutralise les débuts de formule dans chaque cellule, sauf un vrai numéro de téléphone", () => {
      for (const v of ["=1+1", "+33123", "-2", "@x", "\tx", "\rx"]) expect(csvCell(v)).toBe(`"'${v}"`);
      expect(csvCell('a "b"')).toBe('"a ""b"""');
      expect(csvCell(null)).toBe('""');
      expect(csvCell("+33 1 23", { phone: true })).toBe('"+33 1 23"');
      expect(csvCell("=1+1", { phone: true })).toBe('"\'=1+1"');
    });
  });

  describe("vues enregistrées", () => {
    it("crée, liste et supprime ses vues ; chacun ne voit que les siennes", async () => {
      const a = await login_("AGENT");
      const b = await login_("AGENT");
      const body = {
        page: "leads",
        name: "Chauds à Lyon",
        filters: { qualification: "Chaud", city: "Lyon" },
      };
      const created = await call("POST", "/views", a.cookie, body);
      expect(created.statusCode).toBe(201);
      expect((await call("GET", "/views?page=leads", a.cookie)).json()).toHaveLength(1);
      expect((await call("GET", "/views?page=leads", b.cookie)).json()).toHaveLength(0);
      expect((await call("GET", "/views?page=calls", a.cookie)).json()).toHaveLength(0);
      expect((await call("DELETE", `/views/${created.json().id}`, b.cookie)).statusCode).toBe(404); // pas la sienne
      expect((await call("DELETE", `/views/${created.json().id}`, a.cookie)).statusCode).toBe(200);
      expect(await t.db.$count(savedViews)).toBe(0);
    });

    it("refuse un nom en double, un critère inconnu, et plus de 30 vues par page", async () => {
      const a = await login_("VIEWER");
      const ok = { page: "leads", name: "V", filters: { q: "x" } };
      expect((await call("POST", "/views", a.cookie, ok)).statusCode).toBe(201);
      expect((await call("POST", "/views", a.cookie, ok)).statusCode).toBe(409);
      expect(
        (await call("POST", "/views", a.cookie, { ...ok, name: "Autre", filters: { evil: "1" } })).statusCode,
      ).toBe(400);
      for (let i = 0; i < 29; i++)
        expect((await call("POST", "/views", a.cookie, { ...ok, name: `Vue ${i}` })).statusCode).toBe(201);
      expect((await call("POST", "/views", a.cookie, { ...ok, name: "De trop" })).statusCode).toBe(409);
      expect(
        (await call("POST", "/views", a.cookie, { ...ok, page: "calls", name: "Autre page" })).statusCode,
      ).toBe(201);
    });
  });
});
