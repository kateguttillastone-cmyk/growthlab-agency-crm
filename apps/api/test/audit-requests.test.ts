import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditRequests, companies, contacts, suppressions } from "../src/db/schema";
import type { MailSender, OutgoingMail, SendResult } from "../src/mail/brevo";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

const SITE = "https://www.exemple-agence.test";
const prodEnv = {
  SEND_MODE: "prod",
  APP_ORIGIN: "https://crm.exemple.fr",
  BREVO_API_KEY: "cle-de-test-non-reelle",
  BREVO_WEBHOOK_SECRET: "w".repeat(32),
  UNSUBSCRIBE_SECRET: "u".repeat(40),
  SEND_TEST_RECIPIENT: "test@exemple.fr",
  MAIL_FROM_ADDRESS: "equipe@exemple.fr",
  AUDIT_FORM_ORIGINS: SITE,
  AUDIT_NOTIFY_EMAIL: "equipe-interne@exemple.fr",
  AUDIT_FORM_RATE_LIMIT_PER_MINUTE: "100",
};

class FakeSender implements MailSender {
  sent: OutgoingMail[] = [];
  next: SendResult | null = null;
  async send(mail: OutgoingMail): Promise<SendResult> {
    this.sent.push(mail);
    return this.next ?? { kind: "sent", messageId: `<msg-${this.sent.length}@test>` };
  }
}

const form = (over: Record<string, unknown> = {}) => ({
  companyName: "Boulangerie Dupont",
  website: "https://www.boulangerie-dupont.test",
  email: "Contact@Boulangerie-Dupont.test",
  phone: "06 12 34 56 78",
  subject: "Demande de devis Pack Ads",
  message: "Nous voulons plus de clients en ligne.",
  consent: true,
  ...over,
});

/** Attend la fin de l'envoi en arrière-plan (accusé + alerte). */
async function settled(t: TestApp, sender: FakeSender, expected: number) {
  for (let i = 0; i < 50; i++) {
    const [row] = await t.db.select().from(auditRequests).limit(1);
    if (row && row.ackStatus !== "pending" && sender.sent.length >= expected) return row;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("L'envoi en arrière-plan n'a pas abouti");
}

describe("demandes d'audit du site", () => {
  let t: TestApp;
  const sender = new FakeSender();
  beforeAll(async () => {
    t = await createTestApp(prodEnv, undefined, sender);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t);
    sender.sent = [];
    sender.next = null;
  });

  const post = (payload: object, origin: string | undefined = SITE) =>
    t.app.inject({
      method: "POST",
      url: "/public/audit-requests",
      payload,
      headers: origin ? { origin } : {},
    });
  const as = async (role: "ADMIN" | "MANAGER" | "AGENT" | "VIEWER") =>
    login(t, (await createUser(t, role)).email);
  const get = (url: string, c: string) => t.app.inject({ method: "GET", url, headers: withOrigin(c) });
  const patch = (url: string, c: string, payload: object) =>
    t.app.inject({ method: "PATCH", url, payload, headers: withOrigin(c) });
  const postAs = (url: string, c: string, payload: object = {}) =>
    t.app.inject({ method: "POST", url, payload, headers: withOrigin(c) });

  it("enregistre la demande avec la preuve de consentement et envoie l'accusé au visiteur puis l'alerte à l'équipe", async () => {
    const res = await post(form());
    expect(res.statusCode).toBe(201);
    expect(res.headers["access-control-allow-origin"]).toBe(SITE);
    const row = await settled(t, sender, 2);
    expect(row).toMatchObject({
      companyName: "Boulangerie Dupont",
      email: "contact@boulangerie-dupont.test",
      status: "Nouvelle",
      ackStatus: "sent",
    });
    expect(row.consentText).toContain("contacté");
    expect(row.consentAt).toBeInstanceOf(Date);
    const [ack, notify] = sender.sent;
    expect(ack?.to).toBe("contact@boulangerie-dupont.test");
    expect(ack?.subject).toContain("Boulangerie Dupont");
    expect(ack?.text).toContain("Boulangerie Dupont");
    expect(ack?.text).toContain("calendly.com"); // lien de rendez-vous inséré par le gabarit
    expect(ack?.headers["List-Unsubscribe"]).toBeUndefined(); // message de service
    expect(notify?.to).toBe("equipe-interne@exemple.fr");
    expect(notify?.text).toContain("Demande de devis Pack Ads");
  });

  it("refuse de démarrer si une origine du formulaire est mal écrite", async () => {
    const { loadConfig } = await import("../src/config");
    const { testEnv } = await import("./helpers");
    expect(() => loadConfig(testEnv({ AUDIT_FORM_ORIGINS: "pas une adresse" }))).toThrow(/origine valable/);
    expect(() => loadConfig(testEnv({ AUDIT_FORM_ORIGINS: "http://monsite.com" }))).toThrow(
      /origine valable/,
    );
    expect(
      loadConfig(testEnv({ AUDIT_FORM_ORIGINS: "https://a.com/, https://b.com" })).AUDIT_FORM_ORIGINS,
    ).toEqual(["https://a.com", "https://b.com"]);
  });

  it("refuse un envoi sans consentement, sans e-mail valable ou sans site", async () => {
    expect((await post(form({ consent: false }))).statusCode).toBe(400);
    expect((await post(form({ email: "pas-un-mail" }))).statusCode).toBe(400);
    expect((await post(form({ website: "" }))).statusCode).toBe(400);
    expect((await post(form({ website: "pas de site" }))).statusCode).toBe(400);
    expect(await t.db.select().from(auditRequests)).toHaveLength(0);
  });

  it("n'accepte que les sites autorisés (CORS) et répond à la pré-vérification du navigateur", async () => {
    expect((await post(form(), "https://autre-site.test")).statusCode).toBe(403);
    const pre = await t.app.inject({
      method: "OPTIONS",
      url: "/public/audit-requests",
      headers: { origin: SITE, "access-control-request-method": "POST" },
    });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers["access-control-allow-origin"]).toBe(SITE);
    expect(
      (
        await t.app.inject({
          method: "OPTIONS",
          url: "/public/audit-requests",
          headers: { origin: "https://x.test" },
        })
      ).statusCode,
    ).toBe(403);
    expect(await t.db.select().from(auditRequests)).toHaveLength(0);
  });

  it("ignore en silence un robot (champ piège rempli) et un double envoi rapproché", async () => {
    expect((await post(form({ hp: "http://spam.test" }))).statusCode).toBe(201);
    expect(await t.db.select().from(auditRequests)).toHaveLength(0);
    expect((await post(form())).statusCode).toBe(201);
    expect((await post(form())).statusCode).toBe(201);
    expect(await t.db.select().from(auditRequests)).toHaveLength(1);
  });

  it("n'écrit pas à une adresse en rebond ou en plainte, mais garde la demande", async () => {
    await t.db.insert(suppressions).values({ email: "contact@boulangerie-dupont.test", reason: "bounce" });
    await post(form());
    const row = await settled(t, sender, 1); // seule l'alerte interne part
    expect(row.ackStatus).toBe("skipped");
    expect(row.ackError).toContain("exclue");
    expect(sender.sent.every((m) => m.to !== "contact@boulangerie-dupont.test")).toBe(true);
    const c = await as("AGENT");
    const list = (await get("/audit-requests", c)).json();
    expect(list.items[0]).toMatchObject({ suppressed: true });
  });

  it("une panne du fournisseur est lue sur la demande et le renvoi est possible", async () => {
    sender.next = { kind: "rejected", reason: "Brevo 500", permanent: false };
    await post(form());
    const row = await settled(t, sender, 2);
    expect(row).toMatchObject({ ackStatus: "failed", ackError: "Brevo 500" });
    sender.next = null;
    sender.sent = [];
    const c = await as("AGENT");
    const res = await postAs(`/audit-requests/${row.id}/resend-ack`, c);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ackStatus: "sent" });
    expect(sender.sent[0]?.to).toBe("contact@boulangerie-dupont.test");
    // déjà parti : pas de second accusé
    expect((await postAs(`/audit-requests/${row.id}/resend-ack`, c)).statusCode).toBe(409);
  });

  it("est réservée aux agents et plus ; liste filtrée avec compteurs par statut", async () => {
    await post(form());
    await post(
      form({ companyName: "Garage Martin", email: "martin@garage.test", website: "garage-martin.test" }),
    );
    await settled(t, sender, 2);
    expect((await get("/audit-requests", await as("VIEWER"))).statusCode).toBe(403);
    expect((await t.app.inject({ method: "GET", url: "/audit-requests" })).statusCode).toBe(401);
    const c = await as("AGENT");
    const all = (await get("/audit-requests", c)).json();
    expect(all.total).toBe(2);
    expect(all.byStatus).toMatchObject({ Nouvelle: 2, Contactée: 0 });
    const id = all.items.find((i: { companyName: string }) => i.companyName === "Garage Martin").id;
    expect(
      (await patch(`/audit-requests/${id}`, c, { status: "Contactée", note: "Appelé, RDV jeudi" })).json(),
    ).toMatchObject({
      status: "Contactée",
      note: "Appelé, RDV jeudi",
    });
    expect((await get("/audit-requests?status=Nouvelle", c)).json().total).toBe(1);
    expect((await get("/audit-requests?q=garage", c)).json().total).toBe(1);
    expect((await get("/audit-requests/summary", c)).json()).toEqual({ pending: 1 });
    // « Convertie » ne s'obtient que par la conversion
    expect((await patch(`/audit-requests/${id}`, c, { status: "Convertie" })).statusCode).toBe(409);
  });

  it("n'affiche « exclue » ou « déjà prospect » que pour l'adresse réellement concernée", async () => {
    // une autre adresse est exclue et connue comme prospect : la demande d'une adresse sans rapport doit rester neutre
    await t.db.insert(suppressions).values({ email: "autre@exemple.test", reason: "bounce" });
    const [c] = await t.db
      .insert(companies)
      .values({ name: "Autre société", nameKey: "autre societe", domain: "autre.test" })
      .returning();
    await t.db.insert(contacts).values({ companyId: c?.id ?? "", email: "autre@exemple.test", nameKey: "" });
    await post(form({ email: "neutre@exemple.test" }));
    await settled(t, sender, 1);
    const list = (await get("/audit-requests", await as("AGENT"))).json();
    expect(list.items[0]).toMatchObject({
      email: "neutre@exemple.test",
      suppressed: false,
      knownLeadId: null,
    });
  });

  it("accepte un formulaire HTML classique (urlencoded) et garde les paragraphes du message", async () => {
    const body = new URLSearchParams({
      companyName: "Garage Durand",
      website: "garage-durand.test",
      email: "durand@garage-durand.test",
      message: "Bonjour\n\nDeuxième paragraphe",
      consent: "on",
    }).toString();
    const res = await t.app.inject({
      method: "POST",
      url: "/public/audit-requests",
      payload: body,
      headers: { origin: SITE, "content-type": "application/x-www-form-urlencoded" },
    });
    expect(res.statusCode).toBe(201);
    const [row] = await t.db.select().from(auditRequests);
    expect(row?.message).toBe("Bonjour\n\nDeuxième paragraphe");
    expect(row?.consentText).toContain("GrowthLab Agencycom");
    // case non cochée dans un formulaire HTML : refusé
    const refused = await t.app.inject({
      method: "POST",
      url: "/public/audit-requests",
      payload: new URLSearchParams({ companyName: "X Y", website: "x.test", email: "x@x.test" }).toString(),
      headers: { origin: SITE, "content-type": "application/x-www-form-urlencoded" },
    });
    expect(refused.statusCode).toBe(400);
  });

  it("nettoie les caractères de contrôle, ne stocke pas l'adresse IP et ne laisse pas un saut de ligne dans l'objet", async () => {
    const res = await post(
      form({ companyName: "Boulangerie\u0000 Dupont\r\nBcc: x@y.test", subject: "Objet\nsur deux lignes" }),
    );
    expect(res.statusCode).toBe(201);
    const [row] = await t.db.select().from(auditRequests);
    expect(row?.companyName).toBe("Boulangerie Dupont Bcc: x@y.test");
    expect(row?.subject).toBe("Objet sur deux lignes");
    const { auditEvents } = await import("../src/db/schema");
    const events = await t.db.select().from(auditEvents);
    expect(events.find((e) => e.action === "audit_request.received")?.ip).toBeNull();
  });

  it("n'écrit pas en rafale à un tiers : au-delà de 3 demandes par jour avec la même adresse, plus d'accusé", async () => {
    for (let i = 0; i < 5; i++) {
      await post(form({ subject: `Demande ${i}`, message: `Message ${i}` }));
      await new Promise((r) => setTimeout(r, 120));
    }
    await settled(t, sender, 1);
    await new Promise((r) => setTimeout(r, 300));
    const toVisitor = sender.sent.filter((m) => m.to === "contact@boulangerie-dupont.test");
    expect(toVisitor).toHaveLength(3);
    const rows = await t.db.select().from(auditRequests);
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.ackError?.includes("Trop de demandes"))).toHaveLength(2);
  });

  it("refuse un déluge de demandes (garde-fou global par heure)", async () => {
    await t.db.insert(auditRequests).values(
      Array.from({ length: 300 }, (_, i) => ({
        companyName: `Entreprise ${i}`,
        website: `site${i}.test`,
        email: `u${i}@exemple.test`,
        consentText: "x",
      })),
    );
    expect((await post(form())).statusCode).toBe(429);
  });

  it("convertit en lead Chaud sans doublon et rattache la demande à un prospect déjà connu", async () => {
    await post(form());
    await settled(t, sender, 2);
    const c = await as("AGENT");
    const id = (await get("/audit-requests", c)).json().items[0].id as string;
    const res = await postAs(`/audit-requests/${id}/convert`, c);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ existing: false, request: { status: "Convertie" } });
    const lead = (await get(`/leads/${body.leadId}`, c)).json();
    expect(lead).toMatchObject({
      qualification: "Chaud",
      source: "Demande d'audit (site)",
      stage: "Nouveau",
    });
    expect(lead.comment).toContain("Demande de devis Pack Ads");
    expect(await t.db.select().from(companies)).toHaveLength(1);
    // convertir deux fois renvoie le même lead
    expect((await postAs(`/audit-requests/${id}/convert`, c)).json()).toMatchObject({
      leadId: body.leadId,
      existing: true,
    });

    // une seconde demande du même contact : rattachée au lead existant, sans doublon
    await post(form({ subject: "Autre sujet", message: "Une autre question" }));
    const second = (await get("/audit-requests?status=Nouvelle", c)).json().items[0];
    expect(second.knownLeadId).toBe(body.leadId);
    const again = (await postAs(`/audit-requests/${second.id}/convert`, c)).json();
    expect(again).toMatchObject({ leadId: body.leadId, existing: true });
    expect(await t.db.select().from(contacts)).toHaveLength(1);
    const events = (await get(`/leads/${body.leadId}`, c)).json().events as Array<{ type: string }>;
    expect(events.some((e) => e.type === "audit_request_linked")).toBe(true);
    const [stored] = await t.db.select().from(auditRequests).where(eq(auditRequests.id, second.id));
    expect(stored?.status).toBe("Convertie");
  });
});

describe("demandes d'audit : serveur sans envoi réel", () => {
  let t: TestApp;
  const sender = new FakeSender();
  afterAll(() => t?.close());

  it("en mode test l'accusé part à l'adresse de test, jamais au visiteur", async () => {
    t = await createTestApp(
      {
        AUDIT_FORM_ORIGINS: SITE,
        SEND_TEST_RECIPIENT: "test@exemple.fr",
        AUDIT_NOTIFY_EMAIL: "equipe-interne@exemple.fr",
        AUDIT_FORM_RATE_LIMIT_PER_MINUTE: "100",
      },
      undefined,
      sender,
    );
    await resetDb(t);
    const res = await t.app.inject({
      method: "POST",
      url: "/public/audit-requests",
      payload: form(),
      headers: { origin: SITE },
    });
    expect(res.statusCode).toBe(201);
    const row = await settled(t, sender, 2);
    expect(row.ackStatus).toBe("skipped");
    expect(row.ackError).toContain("Mode test");
    expect(sender.sent.map((m) => m.to)).toEqual(["test@exemple.fr", "test@exemple.fr"]);
    expect(sender.sent[0]?.subject.startsWith("[TEST]")).toBe(true);
  });

  it("sans fournisseur d'e-mails, la demande est gardée et l'accusé marqué « non parti »", async () => {
    await t.close();
    t = await createTestApp({ AUDIT_FORM_ORIGINS: SITE, AUDIT_FORM_RATE_LIMIT_PER_MINUTE: "100" });
    await resetDb(t);
    await t.app.inject({
      method: "POST",
      url: "/public/audit-requests",
      payload: form(),
      headers: { origin: SITE },
    });
    const row = await settled(t, new FakeSender(), 0);
    expect(row).toMatchObject({ ackStatus: "skipped", status: "Nouvelle" });
    expect(row.ackError).toContain("Envoi désactivé");
  });
});
