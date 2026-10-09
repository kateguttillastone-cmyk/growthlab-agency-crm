import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { contacts, emailMessages, leadEvents, suppressions } from "../src/db/schema";
import { importAirtableCsv } from "../src/import/airtable";
import type { MailSender, OutgoingMail, SendResult } from "../src/mail/brevo";
import { verifyUnsubscribe } from "../src/mail/unsubscribe-token";
import { sendTick } from "../src/modules/sending/service";
import { type AirtableRow, linkedinRow, toCsv } from "./fixtures/airtable-csv";
import { createTestApp, createUser, login, resetDb, type TestApp, testEnv, withOrigin } from "./helpers";

const SECRET_WEBHOOK = "w".repeat(32);
const SECRET_UNSUB = "u".repeat(40);
const prodEnv = {
  SEND_MODE: "prod",
  APP_ORIGIN: "https://crm.exemple.fr",
  BREVO_API_KEY: "cle-de-test-non-reelle",
  BREVO_WEBHOOK_SECRET: SECRET_WEBHOOK,
  UNSUBSCRIBE_SECRET: SECRET_UNSUB,
  SEND_TEST_RECIPIENT: "test@exemple.fr",
  MAIL_FROM_ADDRESS: "equipe@exemple.fr",
  SEND_INTERVAL_SECONDS: "5",
  SEND_DAILY_CAP: "50",
};
// mardi 14 juillet 2026, 09:30 à Paris : créneau ouvert
const IN_SLOT = () => new Date("2026-07-14T07:30:00Z");
const OUT_OF_SLOT = () => new Date("2026-07-17T07:30:00Z");

class FakeSender implements MailSender {
  sent: OutgoingMail[] = [];
  next: SendResult | null = null;
  n = 0;
  async send(mail: OutgoingMail): Promise<SendResult> {
    this.sent.push(mail);
    if (this.next) return this.next;
    this.n += 1;
    return { kind: "sent", messageId: `<msg-${this.n}@test>` };
  }
}

describe("envoi planifié", () => {
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
    sender.n = 0;
  });

  const ready = (name: string, over: AirtableRow = {}): AirtableRow =>
    linkedinRow({
      Entreprise: name,
      "Site web": `${name.toLowerCase()}.fr`,
      Email: `${name.toLowerCase()}@${name.toLowerCase()}.fr`,
      Prénom: name,
      Linkedin: `https://l/${name}`,
      "Validation mail": "Validé",
      "Statut email": "",
      "Email envoyé le": "",
      "Étape pipeline": "",
      ...over,
    });
  const seed = async (rows: AirtableRow[], checked = true) => {
    await importAirtableCsv(t.db, toCsv(rows));
    if (checked) await t.db.update(contacts).set({ emailCheck: "valid", emailCheckedAt: new Date() });
  };
  const tick = (config = t.config, now = IN_SLOT) => sendTick({ db: t.db, config, sender, now });
  const messages = () => t.db.select().from(emailMessages);
  const as = async (role: "ADMIN" | "MANAGER" | "AGENT") => login(t, (await createUser(t, role)).email);
  const req = (method: "GET" | "POST", url: string, c?: string, payload?: object) =>
    t.app.inject({ method, url, payload, headers: withOrigin(c) });

  it("ne fait rien hors créneau, en pause, ou quand l'envoi est désactivé", async () => {
    await seed([ready("Alpha")]);
    expect(await tick(t.config, OUT_OF_SLOT)).toMatchObject({ kind: "idle", reason: "hors créneau" });
    const off = testEnv({});
    expect(await tick({ ...t.config, SEND_MODE: "off" })).toMatchObject({ kind: "idle" });
    expect(off.SEND_MODE).toBeUndefined();
    const admin = await as("ADMIN");
    await req("POST", "/emails/send-pause", admin, { paused: true });
    expect(await tick()).toMatchObject({ kind: "idle", reason: "en pause" });
    await req("POST", "/emails/send-pause", admin, { paused: false });
    expect((await tick()).kind).toBe("sent");
    expect(sender.sent).toHaveLength(1);
  });

  it("envoie un e-mail validé : statut, date, identifiant, historique, contenu complet", async () => {
    await seed([ready("Alpha")]);
    const out = await tick();
    expect(out.kind).toBe("sent");
    const [m] = await messages();
    expect(m).toMatchObject({ status: "Envoyé", providerMessageId: "<msg-1@test>", sendError: null });
    expect(m?.sentAt).not.toBeNull();
    expect(m?.sentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const mail = sender.sent[0] as OutgoingMail;
    expect(mail.to).toBe("alpha@alpha.fr");
    expect(mail.from.email).toBe("equipe@exemple.fr");
    expect(mail.html).toContain("répondez simplement « stop »"); // mention d'opposition
    expect(mail.text).toContain("Pour échanger"); // agenda
    const unsub = /<https:\/\/crm\.exemple\.fr\/api\/unsubscribe\/([^>]+)>/.exec(
      mail.headers["List-Unsubscribe"] ?? "",
    );
    expect(verifyUnsubscribe(unsub?.[1] ?? "", SECRET_UNSUB)).toBe("alpha@alpha.fr");
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(await t.db.$count(leadEvents, eq(leadEvents.type, "email_sent"))).toBe(1);
    expect((await tick()).kind).toBe("idle"); // rien d'autre à envoyer
  });

  it("n'envoie jamais : non validé, adresse non contrôlée ou inutilisable, exclue, texte vide, déjà envoyé", async () => {
    await seed(
      [
        ready("Brouillon", { "Validation mail": "Pas Validé" }),
        ready("Rejete", { "Validation mail": "Rejeté" }),
        ready("Vide", { "Email corps": "" }),
        ready("Exclu"),
        ready("Mauvaise"),
        ready("Envoye", { "Statut email": "Délivré", "Email envoyé le": "21/9/2026" }),
        ready("Nonverifiee"),
      ],
      true,
    );
    await t.db.insert(suppressions).values({ email: "exclu@exclu.fr", reason: "unsubscribe" });
    await t.db
      .update(contacts)
      .set({ emailCheck: "no_mail_server" })
      .where(eq(contacts.email, "mauvaise@mauvaise.fr"));
    await t.db
      .update(contacts)
      .set({ emailCheck: null, emailCheckedAt: null })
      .where(eq(contacts.email, "nonverifiee@nonverifiee.fr"));
    expect(await tick()).toMatchObject({ kind: "idle", reason: "rien à envoyer" });
    expect(sender.sent).toHaveLength(0);
  });

  it("commence par les prospects chauds", async () => {
    await seed([ready("Froid", { Qualification: "Froid" }), ready("Chaud", { Qualification: "Chaud" })]);
    await tick();
    expect(sender.sent[0]?.to).toBe("chaud@chaud.fr");
  });

  it("respecte le délai entre deux envois et le plafond du jour", async () => {
    await seed([ready("Alpha"), ready("Bravo"), ready("Charlie")]);
    const cfg = { ...t.config, SEND_INTERVAL_SECONDS: 3600, SEND_DAILY_CAP: 2 };
    expect((await tick(cfg)).kind).toBe("sent");
    expect(await tick(cfg)).toMatchObject({ kind: "idle", reason: "délai entre deux envois" });
    await t.db.execute(
      `update email_messages set sent_at = now() - interval '2 hours', sending_at = now() - interval '2 hours' where sent_at is not null` as never,
    );
    expect((await tick(cfg)).kind).toBe("sent");
    await t.db.execute(
      `update email_messages set sent_at = now() - interval '1 hour', sending_at = now() - interval '1 hour' where sent_at is not null` as never,
    );
    expect(await tick(cfg)).toMatchObject({ kind: "idle", reason: "plafond du jour atteint" });
    expect(sender.sent).toHaveLength(2);
  });

  it("dix exécutions simultanées n'envoient qu'une seule fois le même e-mail", async () => {
    await seed([ready("Alpha")]);
    const results = await Promise.all(Array.from({ length: 10 }, () => tick()));
    expect(results.filter((r) => r.kind === "sent")).toHaveLength(1);
    expect(sender.sent).toHaveLength(1);
  });

  it("dix exécutions simultanées respectent le délai : un seul envoi malgré plusieurs e-mails prêts", async () => {
    await seed(Array.from({ length: 5 }, (_, i) => ready(`Societe${i}`)));
    const cfg = { ...t.config, SEND_INTERVAL_SECONDS: 3600 };
    await Promise.all(Array.from({ length: 10 }, () => tick(cfg)));
    expect(sender.sent).toHaveLength(1);
  });

  it("un refus définitif est compté puis l'e-mail est abandonné ; un refus temporaire ne l'est pas", async () => {
    await seed([ready("Alpha")]);
    sender.next = { kind: "rejected", permanent: false, reason: "Brevo 429" };
    for (let i = 0; i < 4; i++) {
      await tick();
      await t.db.execute(`update email_messages set sending_at = null where status is null` as never);
    }
    expect((await messages())[0]?.sendFailures).toBe(0);
    sender.next = { kind: "rejected", permanent: true, reason: "Brevo 400 : adresse refusée" };
    for (let i = 0; i < 5; i++)
      await t.db
        .execute(`update email_messages set sending_at = null where status is null` as never)
        .then(() => tick());
    const [m] = await messages();
    expect(m).toMatchObject({ sendFailures: 3, status: null });
    expect(m?.sendError).toContain("adresse refusée");
    sender.next = null;
    expect(await tick()).toMatchObject({ kind: "idle", reason: "rien à envoyer" });
  });

  it("un résultat incertain garde la réservation : jamais de renvoi automatique ; la libération est manuelle", async () => {
    await seed([ready("Alpha")]);
    sender.next = { kind: "uncertain", reason: "délai dépassé" };
    expect((await tick()).kind).toBe("uncertain");
    sender.next = null;
    await t.db.execute(`update email_messages set sending_at = now() - interval '1 hour'` as never);
    expect(await tick()).toMatchObject({ kind: "idle", reason: "rien à envoyer" });
    expect(sender.sent).toHaveLength(1);
    const admin = await as("ADMIN");
    const id = (await t.db.select({ id: emailMessages.leadId }).from(emailMessages))[0]?.id ?? "";
    expect((await req("POST", `/leads/${id}/email/release`, await as("MANAGER"))).statusCode).toBe(403);
    const status = (await req("GET", "/emails/send-status", admin)).json();
    expect(status.uncertain).toBe(1);
    expect((await req("POST", `/leads/${id}/email/release`, admin)).statusCode).toBe(200);
    expect((await tick()).kind).toBe("sent");
    expect((await req("POST", `/leads/${id}/email/release`, admin)).statusCode).toBe(409); // plus rien à libérer
  });

  it("l'état d'envoi expose les compteurs, jamais les secrets", async () => {
    await seed([ready("Alpha"), ready("Bravo"), ready("Brouillon", { "Validation mail": "Pas Validé" })]);
    await t.db.update(contacts).set({ emailCheck: null }).where(eq(contacts.email, "bravo@bravo.fr"));
    const res = await req("GET", "/emails/send-status", await as("MANAGER"));
    const s = res.json();
    expect(s).toMatchObject({
      mode: "prod",
      configured: true,
      ready: 1,
      blocked: 1,
      uncertain: 0,
      sentToday: 0,
    });
    expect(JSON.stringify(s)).not.toContain("cle-de-test");
    expect(JSON.stringify(s)).not.toContain(SECRET_UNSUB);
    expect((await req("GET", "/emails/send-status", await as("AGENT"))).statusCode).toBe(403);
  });

  describe("envoi de test", () => {
    it("part vers l'adresse de test uniquement, sans rien marquer comme envoyé", async () => {
      await seed([ready("Alpha")]);
      const id = (await t.db.select({ id: emailMessages.leadId }).from(emailMessages))[0]?.id ?? "";
      expect((await req("POST", "/emails/test-send", await as("MANAGER"), { leadId: id })).statusCode).toBe(
        403,
      );
      const res = await req("POST", "/emails/test-send", await as("ADMIN"), { leadId: id });
      expect(res.json()).toEqual({ sentTo: "test@exemple.fr" });
      expect(sender.sent[0]).toMatchObject({ to: "test@exemple.fr" });
      expect(sender.sent[0]?.subject.startsWith("[TEST] ")).toBe(true);
      expect(sender.sent[0]?.headers["List-Unsubscribe"]).toBeUndefined();
      expect((await messages())[0]?.status).toBeNull();
    });

    it("signale un échec du fournisseur", async () => {
      await seed([ready("Alpha")]);
      const id = (await t.db.select({ id: emailMessages.leadId }).from(emailMessages))[0]?.id ?? "";
      sender.next = { kind: "rejected", permanent: true, reason: "Brevo 401" };
      expect((await req("POST", "/emails/test-send", await as("ADMIN"), { leadId: id })).statusCode).toBe(
        502,
      );
    });
  });

  describe("retours du fournisseur (webhook)", () => {
    const hook = (payload: unknown, token = SECRET_WEBHOOK) =>
      t.app.inject({ method: "POST", url: `/webhooks/brevo/${token}`, payload: payload as object });
    const sentOne = async () => {
      await seed([ready("Alpha")]);
      await tick();
      return "<msg-1@test>";
    };
    const status = async () => (await messages())[0]?.status;

    it("refuse un jeton incorrect", async () => {
      await sentOne();
      expect((await hook({ event: "hard_bounce", email: "alpha@alpha.fr" }, "x".repeat(32))).statusCode).toBe(
        404,
      );
      expect(await t.db.$count(suppressions)).toBe(0);
    });

    it("fait avancer le statut sans jamais le faire reculer", async () => {
      const id = await sentOne();
      await hook({ event: "delivered", email: "alpha@alpha.fr", "message-id": id });
      expect(await status()).toBe("Délivré");
      await hook({ event: "opened", email: "alpha@alpha.fr", "message-id": id });
      expect(await status()).toBe("Ouvert");
      await hook({ event: "delivered", email: "alpha@alpha.fr", "message-id": id });
      expect(await status()).toBe("Ouvert");
      expect(await t.db.$count(leadEvents, eq(leadEvents.type, "email_status"))).toBe(2);
    });

    it("un rebond définitif exclut l'adresse ; rejouer l'évènement ne change rien", async () => {
      const id = await sentOne();
      for (let i = 0; i < 2; i++)
        await hook({ event: "hard_bounce", email: "Alpha@Alpha.fr", "message-id": id });
      expect(await status()).toBe("Bounce");
      const rows = await t.db.select().from(suppressions);
      expect(rows).toEqual([expect.objectContaining({ email: "alpha@alpha.fr", reason: "bounce" })]);
      expect(await t.db.$count(leadEvents, eq(leadEvents.type, "email_status"))).toBe(1);
    });

    it("plainte et désinscription excluent l'adresse ; un rebond temporaire est ignoré ; un lot est accepté", async () => {
      const id = await sentOne();
      await hook([
        { event: "soft_bounce", email: "alpha@alpha.fr", "message-id": id },
        { event: "request", email: "alpha@alpha.fr", "message-id": id },
        { event: "spam", email: "x@plainte.fr" },
        { event: "unsubscribed", email: "y@desinscrit.fr" },
      ]);
      expect(await status()).toBe("Envoyé");
      const rows = await t.db.select().from(suppressions);
      expect(rows.map((r) => `${r.email}:${r.reason}`).sort()).toEqual([
        "x@plainte.fr:complaint",
        "y@desinscrit.fr:unsubscribe",
      ]);
    });

    it("ignore une charge illisible sans erreur", async () => {
      await sentOne();
      expect((await hook({ n: "importe quoi" })).statusCode).toBe(200);
    });
  });

  describe("désinscription par lien", () => {
    const path = async (email = "alpha@alpha.fr") => {
      const { signUnsubscribe } = await import("../src/mail/unsubscribe-token");
      return `/unsubscribe/${signUnsubscribe(email, SECRET_UNSUB)}`;
    };

    it("un simple affichage du lien n'exclut personne ; la confirmation exclut", async () => {
      await seed([ready("Alpha", { "Statut email": "Délivré", "Email envoyé le": "21/9/2026" })]);
      const url = await path();
      const page = await t.app.inject({ method: "GET", url });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain("Me désinscrire");
      expect(await t.db.$count(suppressions)).toBe(0);
      const done = await t.app.inject({ method: "POST", url });
      expect(done.statusCode).toBe(200);
      expect(await t.db.select().from(suppressions)).toEqual([
        expect.objectContaining({ email: "alpha@alpha.fr", reason: "unsubscribe" }),
      ]);
      expect((await messages())[0]?.status).toBe("Désinscrit");
    });

    it("accepte la désinscription en un clic des messageries (formulaire) et refuse un lien forgé", async () => {
      const url = await path();
      const oneClick = await t.app.inject({
        method: "POST",
        url,
        payload: "List-Unsubscribe=One-Click",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
      expect(oneClick.statusCode).toBe(200);
      expect(await t.db.$count(suppressions)).toBe(1);
      expect(
        (await t.app.inject({ method: "POST", url: "/unsubscribe/aGFja2VkQHguZnI.signature-bidon" }))
          .statusCode,
      ).toBe(404);
      expect((await t.app.inject({ method: "GET", url: "/unsubscribe/n-importe-quoi" })).statusCode).toBe(
        404,
      );
    });
  });

  describe("exclusion manuelle", () => {
    it("exclut l'adresse et remet à relire l'e-mail validé non envoyé", async () => {
      await seed([ready("Alpha")]);
      const res = await req("POST", "/suppressions", await as("MANAGER"), {
        email: "ALPHA@alpha.fr",
        note: "a répondu stop",
      });
      expect(res.json()).toEqual({ email: "alpha@alpha.fr", created: true });
      expect((await messages())[0]?.validation).toBe("Pas Validé");
      expect(await tick()).toMatchObject({ kind: "idle" });
      expect((await req("POST", "/suppressions", await as("AGENT"), { email: "a@b.fr" })).statusCode).toBe(
        403,
      );
      const again = await req("POST", "/suppressions", await as("MANAGER"), { email: "alpha@alpha.fr" });
      expect(again.json().created).toBe(false);
    });
  });
});

void and;
