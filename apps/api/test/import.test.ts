import { eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { companies, contacts, emailMessages, leadEvents, leads, suppressions } from "../src/db/schema";
import { importAirtableCsv } from "../src/import/airtable";
import { linkedinRow, mapsRow, toCsv } from "./fixtures/airtable-csv";
import { createTestApp, resetDb, type TestApp } from "./helpers";

describe("import de l'export CSV d'Airtable", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const count = async (table: PgTable) => {
    const { rows } = await t.db.execute<{ n: string }>(sql`select count(*)::text as n from ${table}`);
    return Number(rows[0]?.n ?? 0);
  };
  const run = (rows: Parameters<typeof toCsv>[0], opts = {}) => importAirtableCsv(t.db, toCsv(rows), opts);

  it("importe un prospect LinkedIn complet : entreprise, contact, lead, e-mail, normalisations", async () => {
    const report = await run([linkedinRow()]);
    expect(report).toMatchObject({
      rows: 1,
      skipped: 0,
      companies: { created: 1 },
      contacts: { created: 1 },
      leads: { created: 1 },
      emailMessages: { created: 1 },
    });

    const [c] = await t.db.select().from(companies);
    expect(c).toMatchObject({
      name: "Atelier Test",
      domain: "atelier-test.fr",
      website: "https://www.atelier-test.fr/accueil?x=1",
      employees: 6,
      phone: "+33123456789",
      country: "FR",
      region: "Ile-de-france",
      organicTraffic: 120,
      cms: "WordPress",
      // le site a été mesuré : une case vide signifie « non », pas « inconnu »
      hasGtm: true,
      hasSsl: true,
      hasGa4: false,
      isEcommerce: false,
    });
    const [p] = await t.db.select().from(contacts);
    expect(p).toMatchObject({
      email: "camille.martin@exemple-test.fr",
      firstName: "Camille",
      jobTitle: "Gérante",
    });

    const [l] = await t.db.select().from(leads);
    expect(l).toMatchObject({
      qualification: "Chaud",
      // « Google Ads (Search) + Mise en place du tracking » → service normalisé, formulation d'origine conservée
      service: "Google Ads",
      serviceDetail: "Google Ads (Search) + Mise en place du tracking",
      stage: "Contacté",
      source: "LinkedIn Lead Finder",
    });
    expect(l?.detectedAt.toISOString()).toBe("2026-09-18T14:00:00.000Z");

    const [m] = await t.db.select().from(emailMessages);
    expect(m).toMatchObject({ validation: "Validé", status: "Délivré", sentOn: "2026-09-21", sequenceNo: 1 });
    // saut de ligne et guillemets d'un champ multi-lignes préservés
    expect(m?.body).toContain("Bonjour Camille,\n\nPremier paragraphe, avec « guillemets »");
    // « 20/9/2026 3:05pm » à -04:00
    expect(m?.validatedAt?.toISOString()).toBe("2026-09-20T19:05:00.000Z");
    expect(await t.db.select().from(leadEvents).where(eq(leadEvents.type, "imported"))).toHaveLength(1);
  });

  it("importe un prospect Google Maps sans site ni contact", async () => {
    const report = await run([mapsRow()]);
    expect(report.contacts.created).toBe(0);
    expect(report.emailMessages.created).toBe(0);
    const [l] = await t.db.select().from(leads);
    // « À qualifier - Sans site web » n'est pas une qualification : le lead est simplement non qualifié
    expect(l).toMatchObject({
      contactId: null,
      qualification: null,
      service: "Création de site",
      callState: "À appeler",
    });
    const [c] = await t.db.select().from(companies);
    expect(c).toMatchObject({
      domain: null,
      phone: "+33411223344",
      googleRating: 4.5,
      googleReviews: 37,
      hasSsl: null,
    });
    expect(report.warnings).toEqual({});
  });

  it("rapproche les contacts d'une même entreprise par le domaine, mais PAS deux entreprises par le téléphone seul", async () => {
    const report = await run([
      linkedinRow(),
      linkedinRow({
        Prénom: "Paul",
        Nom: "Durand",
        Email: "paul.durand@exemple-test.fr",
        Linkedin: "https://linkedin.com/in/paul",
      }),
      // même standard téléphonique, entreprises différentes (franchise) : deux entreprises
      mapsRow({ Entreprise: "Garage Nord", Téléphone: "03 20 00 00 01" }),
      mapsRow({ Entreprise: "Garage Sud", Téléphone: "03 20 00 00 01" }),
    ]);
    expect(report.companies).toEqual({ created: 3, existing: 1 });
    expect(report.contacts.created).toBe(2);
    expect(report.leads.created).toBe(4);
  });

  it("fusionne un doublon de ligne et signale les anomalies sans données personnelles", async () => {
    const report = await run([
      linkedinRow(),
      linkedinRow(),
      linkedinRow({
        Prénom: "Léa",
        Nom: "Roux",
        Email: "pas-un-email",
        Entreprise: "Autre Société",
        "Site web": "autre-societe.fr",
        Téléphone: "12345",
      }),
      linkedinRow({ Entreprise: "", Email: "x@exemple-test.fr" }),
      {},
    ]);
    expect(report.skipped).toBe(3);
    expect(report.warnings).toMatchObject({
      "doublon de ligne fusionné": 1,
      "e-mail invalide": 1,
      "téléphone non reconnu": 1,
      "ligne sans entreprise ignorée": 1,
      "ligne vide ignorée": 1,
    });
    expect(JSON.stringify(report)).not.toMatch(/exemple-test|Camille|Roux/);
  });

  it("enregistre les rebonds et désinscriptions parmi les adresses à ne plus contacter", async () => {
    const report = await run([
      linkedinRow({ "Statut email": "Bounce" }),
      linkedinRow({
        Prénom: "Paul",
        Nom: "Durand",
        Email: "paul@exemple-test.fr",
        "Statut email": "Désinscrit",
        Linkedin: "https://linkedin.com/in/p",
      }),
      linkedinRow({
        Prénom: "Ana",
        Nom: "Lopez",
        Email: "ana@exemple-test.fr",
        "Statut email": "Ouvert",
        Linkedin: "https://linkedin.com/in/a",
      }),
    ]);
    expect(report.suppressions.created).toBe(2);
    const rows = await t.db.select().from(suppressions).orderBy(suppressions.email);
    expect(rows.map((r) => [r.email, r.reason])).toEqual([
      ["camille.martin@exemple-test.fr", "bounce"],
      ["paul@exemple-test.fr", "unsubscribe"],
    ]);
  });

  it("ignore la note « e-mail vide suite à une panne » quand l'e-mail existe, la garde sinon", async () => {
    const note = "Email vide suite a une panne credit Claude (24/09) - a regenerer";
    const report = await run([
      linkedinRow({ "Prochaine action Ifaliana": note }),
      linkedinRow({
        Prénom: "Paul",
        Nom: "Durand",
        Email: "paul@exemple-test.fr",
        Linkedin: "https://linkedin.com/in/p",
        "Email corps": "",
        "Email objet": "",
        "Prochaine action Ifaliana": note,
      }),
    ]);
    expect(report.warnings["note obsolète ignorée (l'e-mail existe)"]).toBe(1);
    const rows = await t.db
      .select({ nextAction: leads.nextAction, email: contacts.email })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId));
    expect(rows.find((r) => r.email === "camille.martin@exemple-test.fr")?.nextAction).toBeNull();
    expect(rows.find((r) => r.email === "paul@exemple-test.fr")?.nextAction).toBe(note);
  });

  it("est rejouable : un second import ne crée rien et n'écrase aucune modification", async () => {
    const rows = [linkedinRow(), mapsRow()];
    await run(rows);
    await t.db.update(leads).set({ comment: "modifié dans la nouvelle application" });
    const again = await run(rows);
    expect(
      again.companies.created + again.contacts.created + again.leads.created + again.emailMessages.created,
    ).toBe(0);
    expect(again.leads.existing).toBe(2);
    expect(
      (await t.db.select().from(leads)).every((l) => l.comment === "modifié dans la nouvelle application"),
    ).toBe(true);
    expect(await count(leads)).toBe(2);
  });

  it("en simulation, calcule le rapport mais n'écrit rien", async () => {
    const report = await run([linkedinRow(), mapsRow()], { dryRun: true });
    expect(report).toMatchObject({ dryRun: true, leads: { created: 2 } });
    expect(await count(leads)).toBe(0);
    expect(await count(companies)).toBe(0);
    expect(await count(suppressions)).toBe(0);
  });
});
