import { emailWarnings } from "@gac/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, emailMessages, leadEvents, leads, suppressions } from "../src/db/schema";
import { importAirtableCsv } from "../src/import/airtable";
import { type AirtableRow, linkedinRow, mapsRow, toCsv } from "./fixtures/airtable-csv";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

const pending = (over: AirtableRow): AirtableRow =>
  linkedinRow({
    "Validation mail": "Pas Validé",
    "Statut email": "",
    "Email envoyé le": "",
    "Étape pipeline": "",
    ...over,
  });

describe("e-mails : relecture et validation", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const seed = (rows: AirtableRow[]) => importAirtableCsv(t.db, toCsv(rows));
  const as = async (role: "ADMIN" | "MANAGER" | "AGENT" | "VIEWER") =>
    login(t, (await createUser(t, role)).email);
  const send = (method: "GET" | "POST" | "PATCH", url: string, cookie?: string, payload?: object) =>
    t.app.inject({ method, url, payload, headers: withOrigin(cookie) });
  const leadIdOf = async (company: string) => {
    const res = await send("GET", `/leads?q=${encodeURIComponent(company)}`, await as("VIEWER"));
    return res.json().items[0].id as string;
  };
  const detail = async (id: string, cookie: string) => (await send("GET", `/leads/${id}`, cookie)).json();

  const two = () =>
    seed([
      pending({ Entreprise: "Alpha", "Site web": "alpha.fr", Email: "a@alpha.fr", Prénom: "Ana" }),
      pending({ Entreprise: "Bravo", "Site web": "bravo.fr", Email: "b@bravo.fr", Prénom: "Ben" }),
    ]);

  it("réserve aperçu, statistiques, modification et validation groupée aux responsables", async () => {
    await two();
    const id = await leadIdOf("Alpha");
    for (const role of ["AGENT", "VIEWER"] as const) {
      const c = await as(role);
      expect((await send("POST", "/emails/preview", c, { subject: "s", body: "b" })).statusCode).toBe(403);
      expect((await send("GET", "/emails/stats", c)).statusCode).toBe(403);
      expect((await send("PATCH", `/leads/${id}/email`, c, { subject: "x" })).statusCode).toBe(403);
      expect(
        (await send("POST", "/emails/bulk", c, { validation: "Validé", filter: {}, dryRun: true }))
          .statusCode,
      ).toBe(403);
    }
    expect((await send("GET", "/emails/stats")).statusCode).toBe(401);
  });

  it("renvoie un aperçu avec le gabarit (expéditeur, agenda, signature)", async () => {
    const c = await as("MANAGER");
    const res = await send("POST", "/emails/preview", c, { subject: "Objet", body: "Bonjour,\n\nTexte." });
    expect(res.statusCode).toBe(200);
    const m = res.json();
    expect(m.from).toContain("<");
    expect(m.paragraphs.some((p: { type: string }) => p.type === "agenda")).toBe(true);
    expect(m.paragraphs.at(-1).type).toBe("signature");
  });

  it("valide : enregistre qui et quand, écrit l'historique sans contenu", async () => {
    await two();
    const manager = await createUser(t, "MANAGER", { name: "Relectrice" });
    const c = await login(t, manager.email);
    const id = await leadIdOf("Alpha");
    const before = await detail(id, c);
    const res = await send("PATCH", `/leads/${id}/email`, c, {
      validation: "Validé",
      expectedUpdatedAt: before.emailMessage.updatedAt,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().emailMessage.validatedBy).toBe("Relectrice");
    expect(res.json().emailMessage.validatedAt).not.toBeNull();
    const events = await t.db.select().from(leadEvents).where(eq(leadEvents.leadId, id));
    const ev = events.find((e) => e.type === "email_validation");
    expect(ev?.data).toEqual({ from: "Pas Validé", to: "Validé" });
    expect(JSON.stringify(events)).not.toContain("Bonjour");
  });

  it("modifier le texte annule la validation, sauf validation explicite dans la même requête", async () => {
    await two();
    const c = await as("MANAGER");
    const id = await leadIdOf("Alpha");
    await send("PATCH", `/leads/${id}/email`, c, { validation: "Validé" });
    const edited = await send("PATCH", `/leads/${id}/email`, c, { subject: "Nouvel objet pour vous" });
    expect(edited.json().emailMessage.subject).toBe("Nouvel objet pour vous");
    const m = (await detail(id, c)).emailMessage;
    expect(m.validatedAt).toBeNull();
    expect(m.validatedBy).toBeNull();
    expect((await detail(id, c)).email.validation).toBe("Pas Validé");

    const both = await send("PATCH", `/leads/${id}/email`, c, {
      body: "Bonjour,\n\nNouveau.",
      validation: "Validé",
    });
    expect(both.json().email.validation).toBe("Validé");
  });

  it("refuse de valider sans adresse, avec une adresse exclue ou un texte vide", async () => {
    await seed([
      pending({ Entreprise: "Alpha", "Site web": "alpha.fr", Email: "a@alpha.fr" }),
      pending({
        Entreprise: "Vide",
        "Site web": "vide.fr",
        Email: "v@vide.fr",
        "Email objet": "",
        "Email corps": "",
      }),
      pending({ Entreprise: "Bravo", "Site web": "bravo.fr", Email: "", Prénom: "", Nom: "" }),
    ]);
    await t.db.insert(suppressions).values({ email: "a@alpha.fr", reason: "bounce" });
    const c = await as("MANAGER");
    for (const name of ["Alpha", "Vide"]) {
      const id = await leadIdOf(name);
      const res = await send("PATCH", `/leads/${id}/email`, c, { validation: "Validé" });
      expect(res.statusCode, name).toBe(409);
      expect((await detail(id, c)).email.validation).toBe("Pas Validé");
    }
    // l'exclusion est visible dans la liste
    const alpha = (await send("GET", "/leads?q=Alpha", c)).json().items[0];
    expect(alpha.email.blockedReason).toBe("bounce");
    // rejeter reste possible
    const id = await leadIdOf("Alpha");
    expect((await send("PATCH", `/leads/${id}/email`, c, { validation: "Rejeté" })).statusCode).toBe(200);
  });

  it("n'autorise plus aucune modification d'un e-mail envoyé", async () => {
    await seed([linkedinRow({ Entreprise: "Envoyé", "Site web": "envoye.fr" })]);
    const c = await as("MANAGER");
    const id = await leadIdOf("Envoyé");
    const res = await send("PATCH", `/leads/${id}/email`, c, { subject: "Autre objet" });
    expect(res.statusCode).toBe(409);
    expect((await send("PATCH", `/leads/${id}/email`, c, { validation: "Rejeté" })).statusCode).toBe(409);
  });

  it("détecte une modification concurrente (expectedUpdatedAt)", async () => {
    await two();
    const c = await as("MANAGER");
    const id = await leadIdOf("Alpha");
    const seen = (await detail(id, c)).emailMessage.updatedAt;
    expect(
      (await send("PATCH", `/leads/${id}/email`, c, { subject: "Premier objet modifié" })).statusCode,
    ).toBe(200);
    const late = await send("PATCH", `/leads/${id}/email`, c, {
      subject: "Second objet",
      expectedUpdatedAt: seen,
    });
    expect(late.statusCode).toBe(409);
    expect((await detail(id, c)).emailMessage.subject).toBe("Premier objet modifié");
  });

  it("refuse une requête vide et un lead sans e-mail", async () => {
    await seed([mapsRow()]);
    const c = await as("MANAGER");
    const id = await leadIdOf("Électricité");
    expect((await send("PATCH", `/leads/${id}/email`, c, {})).statusCode).toBe(400);
    expect((await send("PATCH", `/leads/${id}/email`, c, { subject: "x" })).statusCode).toBe(404);
  });

  describe("validation groupée", () => {
    const seedMany = () =>
      seed([
        pending({ Entreprise: "Alpha", "Site web": "alpha.fr", Email: "a@alpha.fr", Qualification: "Chaud" }),
        pending({ Entreprise: "Bravo", "Site web": "bravo.fr", Email: "b@bravo.fr", Qualification: "Chaud" }),
        pending({
          Entreprise: "Charlie",
          "Site web": "charlie.fr",
          Email: "c@charlie.fr",
          Qualification: "Froid",
        }),
        pending({ Entreprise: "Delta", "Site web": "delta.fr", Email: "d@delta.fr", Qualification: "Chaud" }),
        linkedinRow({
          Entreprise: "Echo",
          "Site web": "echo.fr",
          Email: "e@echo.fr",
          Qualification: "Chaud",
        }),
      ]);

    it("simule sans rien modifier, puis applique avec l'effectif attendu", async () => {
      await seedMany();
      await t.db.insert(suppressions).values({ email: "d@delta.fr", reason: "unsubscribe" });
      const c = await as("MANAGER");
      const body = { validation: "Validé", filter: { qualification: "Chaud" } };
      const dry = await send("POST", "/emails/bulk", c, { ...body, dryRun: true });
      expect(dry.json()).toMatchObject({ dryRun: true, eligible: 2 });
      expect(dry.json().skipped).toEqual({ "Adresse exclue": 1, "Déjà traités ou envoyés": 1 });
      expect(await t.db.$count(emailMessages, eq(emailMessages.validation, "Validé"))).toBe(1); // Echo seul

      const wrong = await send("POST", "/emails/bulk", c, { ...body, expectedCount: 3 });
      expect(wrong.statusCode).toBe(409);
      const missing = await send("POST", "/emails/bulk", c, body);
      expect(missing.statusCode).toBe(400);

      const done = await send("POST", "/emails/bulk", c, { ...body, expectedCount: 2 });
      expect(done.statusCode).toBe(200);
      expect(done.json().eligible).toBe(2);
      expect(await t.db.$count(emailMessages, eq(emailMessages.validation, "Validé"))).toBe(3);
      // Charlie (Froid) et Delta (exclu) restent à relire
      expect(await t.db.$count(emailMessages, eq(emailMessages.validation, "Pas Validé"))).toBe(2);
      const audit = await t.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, "emails.bulk_validation"));
      expect(audit).toHaveLength(1);
      expect(await t.db.$count(leadEvents, eq(leadEvents.type, "email_validation"))).toBe(2);
      // rejouer ne change plus rien
      const again = await send("POST", "/emails/bulk", c, { ...body, dryRun: true });
      expect(again.json().eligible).toBe(0);
    });

    it("permet de rejeter en groupe, y compris une adresse exclue", async () => {
      await seedMany();
      await t.db.insert(suppressions).values({ email: "d@delta.fr", reason: "bounce" });
      const c = await as("MANAGER");
      const res = await send("POST", "/emails/bulk", c, {
        validation: "Rejeté",
        filter: { qualification: "Chaud" },
        expectedCount: 3,
      });
      expect(res.json().eligible).toBe(3);
      expect(await t.db.$count(emailMessages, eq(emailMessages.validation, "Rejeté"))).toBe(3);
    });

    it("sans filtre, ne touche que les e-mails à relire non envoyés", async () => {
      await seedMany();
      const c = await as("MANAGER");
      const res = await send("POST", "/emails/bulk", c, { validation: "Validé", filter: {}, dryRun: true });
      expect(res.json().eligible).toBe(4);
      const sent = await t.db.select().from(emailMessages).where(eq(emailMessages.validation, "Validé"));
      expect(sent).toHaveLength(1);
      expect(sent[0]?.status).not.toBeNull();
    });
  });

  it("calcule les statistiques et les résultats par version de prompt", async () => {
    await seed([
      pending({ Entreprise: "Alpha", "Site web": "alpha.fr", Email: "a@alpha.fr" }),
      pending({ Entreprise: "Bravo", "Site web": "bravo.fr", Email: "", Prénom: "", Nom: "" }),
      linkedinRow({
        Entreprise: "Charlie",
        "Site web": "charlie.fr",
        Email: "c@charlie.fr",
        "Statut email": "Ouvert",
      }),
      linkedinRow({
        Entreprise: "Delta",
        "Site web": "delta.fr",
        Email: "d@delta.fr",
        "Statut email": "Bounce",
        Version_prompt_email: "v5",
      }),
      pending({ Entreprise: "Echo", "Site web": "echo.fr", Email: "e@echo.fr", "Validation mail": "Rejeté" }),
    ]);
    const c = await as("MANAGER");
    const s = (await send("GET", "/emails/stats", c)).json();
    expect(s).toMatchObject({
      toReview: 1,
      toReviewNoRecipient: 1,
      validatedNotSent: 0,
      rejected: 1,
      sent: 2,
    });
    const v4 = s.byPrompt.find((p: { version: string }) => p.version.startsWith("v4"));
    expect(v4).toMatchObject({ sent: 1, opened: 1, bounced: 0 });
    expect(s.byPrompt.find((p: { version: string }) => p.version === "v5")).toMatchObject({ bounced: 1 });
    // filtre par version de prompt dans la liste
    const list = await send("GET", "/leads?promptVersion=v5", c);
    expect(list.json().total).toBe(1);
  });

  it("n'écrit rien dans les leads eux-mêmes", async () => {
    await two();
    const c = await as("MANAGER");
    const id = await leadIdOf("Alpha");
    const [before] = await t.db.select().from(leads).where(eq(leads.id, id));
    await send("PATCH", `/leads/${id}/email`, c, { validation: "Validé" });
    const [after] = await t.db.select().from(leads).where(eq(leads.id, id));
    expect(after).toEqual(before);
  });
});

describe("contrôles de forme (non bloquants)", () => {
  const ok = {
    subject: "Les clients qui vous cherchent",
    body: `Bonjour Camille,\n\n${"Un texte sobre et utile. ".repeat(12)}\n\nCordialement,`,
  };
  it("ne signale rien pour un e-mail conforme", () => {
    expect(emailWarnings(ok)).toEqual([]);
  });
  it("signale jargon, 0 visiteur, variable, lien, agenda, formule d'appel, objet et longueur", () => {
    const codes = emailWarnings({
      subject: "Oui",
      body: "Salut {{prénom}} 0 visiteurs backlinks https://x.fr calendly",
    }).map((w) => w.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "jargon",
        "zero-visitors",
        "placeholder",
        "link",
        "agenda",
        "subject-length",
        "body-length",
      ]),
    );
    expect(emailWarnings({ subject: ok.subject, body: `Hello,\n\n${ok.body}` }).map((w) => w.code)).toContain(
      "greeting",
    );
  });
});
