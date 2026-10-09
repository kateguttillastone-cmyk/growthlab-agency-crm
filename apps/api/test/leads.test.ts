import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { leadEvents, leads } from "../src/db/schema";
import { importAirtableCsv } from "../src/import/airtable";
import { type AirtableRow, linkedinRow, mapsRow, toCsv } from "./fixtures/airtable-csv";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

describe("leads : lecture, recherche, modification", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const seed = (rows: AirtableRow[]) => importAirtableCsv(t.db, toCsv(rows));
  const get = (url: string, cookie?: string) =>
    t.app.inject({ method: "GET", url, headers: withOrigin(cookie) });
  const patch = (id: string, payload: object, cookie?: string) =>
    t.app.inject({ method: "PATCH", url: `/leads/${id}`, payload, headers: withOrigin(cookie) });
  const as = async (role: "ADMIN" | "MANAGER" | "AGENT" | "VIEWER") =>
    login(t, (await createUser(t, role)).email);

  /** Jeu de données varié : 3 LinkedIn (chaud / tiède / froid), 2 Google Maps sans site. */
  const sample = () =>
    seed([
      linkedinRow({
        Entreprise: "Boulangerie Alpha",
        "Site web": "alpha.fr",
        Email: "a@alpha.fr",
        Prénom: "Ana",
        Nom: "Alpha",
        Linkedin: "https://l/a",
        Qualification: "Chaud",
        Taille: "11",
        "Date détection": "2026-09-10T10:00:00.000-04:00",
        "Trafic organique": "500",
      }),
      linkedinRow({
        Entreprise: "Cabinet Bravo",
        "Site web": "bravo.fr",
        Email: "b@bravo.fr",
        Prénom: "Ben",
        Nom: "Bravo",
        Linkedin: "https://l/b",
        Qualification: "Tiède",
        Taille: "3",
        Secteur: "Insurance",
        "Service recommandé": "Création / refonte de site",
        "Validation mail": "Pas Validé",
        "Statut email": "",
        "Email envoyé le": "",
        "Étape pipeline": "",
        "Date détection": "2026-09-12T10:00:00.000-04:00",
        "Trafic organique": "50",
      }),
      linkedinRow({
        Entreprise: "Domaine Charlie",
        "Site web": "charlie.fr",
        Email: "c@charlie.fr",
        Prénom: "Chloé",
        Nom: "Charlie",
        Linkedin: "https://l/c",
        Qualification: "Froid",
        Taille: "1500",
        "Statut email": "Bounce",
        "Date détection": "2026-09-14T10:00:00.000-04:00",
        "Trafic organique": "",
      }),
      mapsRow({ Entreprise: "Électricité Delta", Téléphone: "01 23 45 00 01", "Note Google": "4.9" }),
      mapsRow({
        Entreprise: "Plomberie Echo",
        Téléphone: "04 11 22 33 55",
        Secteur: "Plombier",
        "Note Google": "3.2",
        "Date détection": "2026-10-05T09:00:00.000-04:00",
      }),
    ]);

  it("exige une session ; les 4 rôles lisent, les lecteurs ne modifient pas", async () => {
    await sample();
    expect((await get("/leads")).statusCode).toBe(401);
    for (const role of ["VIEWER", "AGENT", "MANAGER", "ADMIN"] as const) {
      expect((await get("/leads", await as(role))).statusCode).toBe(200);
    }
    const [one] = await t.db.select().from(leads).limit(1);
    const viewer = await as("VIEWER");
    expect((await patch(one?.id ?? "", { comment: "x" }, viewer)).statusCode).toBe(403);
  });

  it("pagine côté serveur et refuse une page trop grande", async () => {
    await seed(
      Array.from({ length: 120 }, (_, i) =>
        linkedinRow({
          Entreprise: `Société ${i}`,
          "Site web": `s${i}.fr`,
          Email: `c${i}@s${i}.fr`,
          Prénom: "P",
          Nom: `N${i}`,
          Linkedin: `https://l/${i}`,
        }),
      ),
    );
    const cookie = await as("AGENT");
    const p1 = (await get("/leads?limit=50&offset=0", cookie)).json();
    const p2 = (await get("/leads?limit=50&offset=50", cookie)).json();
    const p3 = (await get("/leads?limit=50&offset=100", cookie)).json();
    expect([p1.items.length, p2.items.length, p3.items.length, p1.total]).toEqual([50, 50, 20, 120]);
    // tri stable : aucune ligne n'apparaît deux fois d'une page à l'autre, même à date de détection identique
    const ids = [...p1.items, ...p2.items, ...p3.items].map((x: { id: string }) => x.id);
    expect(new Set(ids).size).toBe(120);
    expect((await get("/leads?limit=1000", cookie)).statusCode).toBe(400);
  });

  it("filtre par qualification (y compris « non qualifié »), étape, segment, service, e-mail", async () => {
    await sample();
    const c = await as("AGENT");
    const total = async (qs: string) => (await get(`/leads?${qs}`, c)).json().total;
    expect(await total("qualification=Chaud")).toBe(1);
    expect(await total("qualification=none")).toBe(2); // les deux prospects Google Maps
    expect(await total("segment=no_website")).toBe(2);
    expect(await total("segment=with_website")).toBe(3);
    expect(await total("service=Refonte de site")).toBe(1);
    expect(await total("service=Création de site")).toBe(2);
    expect(await total("stage=none")).toBe(3); // 2 Maps + Bravo sans étape
    expect(await total("stage=Contacté")).toBe(2);
    expect(await total("validation=Pas Validé")).toBe(1);
    expect(await total("emailStatus=Bounce")).toBe(1);
    expect(await total("emailStatus=none")).toBe(3);
    expect(await total("hasEmail=true")).toBe(3);
    expect(await total("hasEmail=false")).toBe(2);
    expect(await total("callState=À appeler")).toBe(2);
    expect(await total("sector=insurance")).toBe(1); // insensible à la casse
    expect(await total("qualification=Chaud&segment=no_website")).toBe(0); // les filtres se cumulent
    expect((await get("/leads?qualification=Brûlant", c)).statusCode).toBe(400);
  });

  it("recherche par nom, domaine, e-mail, téléphone saisi à la française, et traite % comme un caractère", async () => {
    await sample();
    const c = await as("AGENT");
    const names = async (q: string) =>
      (await get(`/leads?q=${encodeURIComponent(q)}`, c))
        .json()
        .items.map((x: { company: { name: string } }) => x.company.name);
    expect(await names("alpha")).toEqual(["Boulangerie Alpha"]);
    expect(await names("bravo.fr")).toEqual(["Cabinet Bravo"]);
    expect(await names("c@charlie")).toEqual(["Domaine Charlie"]);
    expect(await names("Chloé Charlie")).toEqual(["Domaine Charlie"]);
    expect(await names("01 23 45 00")).toEqual(["Électricité Delta"]); // 01… retrouve +331…
    expect(await names("%")).toEqual([]);
    expect(await names("introuvable")).toEqual([]);
  });

  it("trie : qualification (Chaud d'abord, non qualifiés en dernier), effectif, note ; valeurs absentes toujours à la fin", async () => {
    await sample();
    const c = await as("AGENT");
    const col = async (qs: string, pick: (x: never) => unknown) =>
      (await get(`/leads?${qs}`, c)).json().items.map(pick);
    expect(
      await col("sort=qualification&order=asc", (x: { qualification: string | null }) => x.qualification),
    ).toEqual(["Chaud", "Tiède", "Froid", null, null]);
    expect(
      await col(
        "sort=employees&order=desc",
        (x: { company: { employees: number | null } }) => x.company.employees,
      ),
    ).toEqual([1500, 11, 3, null, null]);
    expect(
      await col(
        "sort=employees&order=asc",
        (x: { company: { employees: number | null } }) => x.company.employees,
      ),
    ).toEqual([3, 11, 1500, null, null]);
    expect(
      await col(
        "sort=rating&order=desc",
        (x: { company: { googleRating: number | null } }) => x.company.googleRating,
      ),
    ).toEqual([4.9, 3.2, null, null, null]);
    expect(
      (await col("sort=company&order=asc", (x: { company: { name: string } }) => x.company.name))[0],
    ).toBe("Boulangerie Alpha");
    expect((await get("/leads?sort=password", c)).statusCode).toBe(400); // liste blanche de colonnes
  });

  it("donne les effectifs par valeur de filtre", async () => {
    await sample();
    const f = (await get("/leads/facets", await as("VIEWER"))).json();
    expect(f.total).toBe(5);
    expect(f.qualification).toEqual({ Chaud: 1, Tiède: 1, Froid: 1, none: 2 });
    expect(f.segment).toEqual({ with_website: 3, no_website: 2 });
    expect(f.service).toMatchObject({ "Google Ads": 2, "Refonte de site": 1, "Création de site": 2 });
    expect(f.emailStatus).toMatchObject({ Bounce: 1, none: 3 });
    expect(f.callState).toEqual({ "À appeler": 2, none: 3 });
  });

  it("renvoie la fiche complète d'un lead avec son historique", async () => {
    await sample();
    const c = await as("VIEWER");
    const { items } = (await get("/leads?q=alpha", c)).json();
    const d = (await get(`/leads/${items[0].id}`, c)).json();
    expect(d.companyDetail).toMatchObject({ cms: "WordPress", hasSsl: true, organicTraffic: 500 });
    expect(d.emailMessage.body).toContain("Bonjour Camille");
    expect(d.events[0]).toMatchObject({ type: "imported", actorName: null });
    expect((await get("/leads/00000000-0000-4000-8000-000000000000", c)).statusCode).toBe(404);
    expect((await get("/leads/pas-un-uuid", c)).statusCode).toBe(400);
  });

  describe("modification", () => {
    const first = async (q: string) => {
      const [x] = (await get(`/leads?q=${encodeURIComponent(q)}`, await as("VIEWER"))).json().items;
      return x.id as string;
    };

    it("un commercial enregistre un statut d'appel : l'étape avance et l'historique le dit", async () => {
      await sample();
      const id = await first("Bravo"); // sans étape
      const agent = await createUser(t, "AGENT", { name: "Ifaliana" });
      const cookie = await login(t, agent.email);
      const res = await patch(id, { callStatus: "RDV fixé", comment: "Rappeler jeudi" }, cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        callStatus: "RDV fixé",
        stage: "RDV programmé",
        comment: "Rappeler jeudi",
      });
      const events = res.json().events;
      expect(events[0].actorName).toBe("Ifaliana");
      expect(
        events.some(
          (e: { type: string; data: Record<string, unknown> }) =>
            e.type === "stage_changed" && e.data.auto === true && e.data.to === "RDV programmé",
        ),
      ).toBe(true);
    });

    it("ne fait jamais reculer l'étape ni toucher aux états finaux, sauf choix explicite", async () => {
      await sample();
      const id = await first("Alpha");
      const cookie = await as("AGENT");
      await patch(id, { stage: "Négociation" }, cookie);
      const r1 = await patch(id, { callStatus: "NRP" }, cookie); // NRP → « Contacté » serait un recul
      expect(r1.json().stage).toBe("Négociation");
      await patch(id, { stage: "Gagné" }, cookie);
      expect((await patch(id, { callStatus: "PI" }, cookie)).json().stage).toBe("Gagné");
      // changement explicite : accepté
      expect((await patch(id, { stage: "Contacté" }, cookie)).json().stage).toBe("Contacté");
    });

    it("réserve la qualification, la valeur, le pack et le responsable aux responsables ; aucune modification partielle", async () => {
      await sample();
      const id = await first("Alpha");
      const agent = await as("AGENT");
      const denied = await patch(id, { comment: "ok", qualification: "Froid" }, agent);
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.code).toBe("FORBIDDEN");
      // le refus n'a rien enregistré, pas même le champ autorisé
      const after = (await get(`/leads/${id}`, agent)).json();
      expect(after.comment).toBeNull();
      expect(after.qualification).toBe("Chaud");

      const manager = await createUser(t, "MANAGER", { name: "Kate" });
      const mc = await login(t, manager.email);
      const ok = await patch(
        id,
        { qualification: "Tiède", dealValue: 1500.5, pack: "Starter", ownerId: manager.id },
        mc,
      );
      expect(ok.json()).toMatchObject({
        qualification: "Tiède",
        dealValue: 1500.5,
        pack: "Starter",
        owner: { name: "Kate" },
      });
      expect((await patch(id, { dealValue: -5 }, mc)).statusCode).toBe(400);
      expect((await patch(id, { ownerId: "00000000-0000-4000-8000-000000000000" }, mc)).statusCode).toBe(409);
    });

    it("efface une valeur avec null, ignore un changement sans effet, refuse un corps vide", async () => {
      await sample();
      const id = await first("Alpha");
      const cookie = await as("MANAGER");
      await patch(id, { comment: "à effacer" }, cookie);
      expect((await patch(id, { comment: null }, cookie)).json().comment).toBeNull();
      const before = (await t.db.select().from(leadEvents).where(eq(leadEvents.leadId, id))).length;
      expect((await patch(id, { comment: null }, cookie)).statusCode).toBe(200); // déjà vide : rien à faire
      expect((await t.db.select().from(leadEvents).where(eq(leadEvents.leadId, id))).length).toBe(before);
      expect((await patch(id, {}, cookie)).statusCode).toBe(400);
      expect((await patch(id, { stage: "Inconnue" }, cookie)).statusCode).toBe(400);
      expect((await patch(id, { companyId: "x" }, cookie)).statusCode).toBe(400); // champ non autorisé : rejeté, jamais ignoré en silence
    });

    it("deux modifications simultanées du même lead restent cohérentes", async () => {
      await sample();
      const id = await first("Alpha");
      const cookie = await as("AGENT");
      const [a, b] = await Promise.all([
        patch(id, { comment: "A" }, cookie),
        patch(id, { nextAction: "B" }, cookie),
      ]);
      expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
      const d = (await get(`/leads/${id}`, cookie)).json();
      expect([d.comment, d.nextAction]).toEqual(["A", "B"]);
    });
  });
});
