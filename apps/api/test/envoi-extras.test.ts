import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, contacts, emailMessages, leadEvents, suppressions } from "../src/db/schema";
import { importAirtableCsv } from "../src/import/airtable";
import type { MailSender, OutgoingMail, SendResult } from "../src/mail/brevo";
import { sendTick } from "../src/modules/sending/service";
import { type AirtableRow, linkedinRow, toCsv } from "./fixtures/airtable-csv";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

const prodEnv = {
  SEND_MODE: "prod",
  APP_ORIGIN: "https://crm.exemple.fr",
  BREVO_API_KEY: "cle-de-test-non-reelle",
  BREVO_WEBHOOK_SECRET: "w".repeat(32),
  UNSUBSCRIBE_SECRET: "u".repeat(40),
  SEND_TEST_RECIPIENT: "test@exemple.fr",
  MAIL_FROM_ADDRESS: "equipe@exemple.fr",
  SEND_INTERVAL_SECONDS: "5",
  SEND_DAILY_CAP: "50",
};
const IN_SLOT = () => new Date("2026-07-14T07:30:00Z"); // mardi 09:30 à Paris

class FakeSender implements MailSender {
  sent: OutgoingMail[] = [];
  next: SendResult | null = null;
  async send(mail: OutgoingMail): Promise<SendResult> {
    this.sent.push(mail);
    return this.next ?? { kind: "sent", messageId: `<msg-${this.sent.length}@test>` };
  }
}

describe("lot envoi : marquer envoyé, annuler un lot, adresses exclues, réglages", () => {
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

  const row = (name: string, over: AirtableRow = {}): AirtableRow =>
    linkedinRow({
      Entreprise: name,
      "Site web": `${name.toLowerCase()}.fr`,
      Email: `${name.toLowerCase()}@${name.toLowerCase()}.fr`,
      Prénom: name,
      Linkedin: `https://l/${name}`,
      "Validation mail": "Pas Validé",
      "Statut email": "",
      "Email envoyé le": "",
      "Étape pipeline": "",
      ...over,
    });
  const seed = async (rows: AirtableRow[]) => {
    await importAirtableCsv(t.db, toCsv(rows));
    await t.db.update(contacts).set({ emailCheck: "valid", emailCheckedAt: new Date() });
  };
  const as = async (role: "ADMIN" | "MANAGER" | "AGENT") => login(t, (await createUser(t, role)).email);
  const call = (method: "GET" | "POST" | "PUT" | "PATCH", url: string, c?: string, payload?: object) =>
    t.app.inject({ method, url, payload, headers: withOrigin(c) });
  const leadId = async (c: string, q: string) =>
    (await call("GET", `/leads?q=${encodeURIComponent(q)}`, c)).json().items[0].id as string;

  describe("marquer un envoi incertain comme envoyé", () => {
    const uncertain = async () => {
      await seed([row("Alpha", { "Validation mail": "Validé" })]);
      sender.next = { kind: "uncertain", reason: "délai dépassé" };
      await sendTick({ db: t.db, config: t.config, sender, now: IN_SLOT });
      sender.next = null;
    };

    it("l'e-mail passe « Envoyé » sans rien renvoyer, avec historique et audit ; réservé aux administrateurs", async () => {
      await uncertain();
      const admin = await as("ADMIN");
      const id = await leadId(admin, "Alpha");
      expect((await call("POST", `/leads/${id}/email/mark-sent`, await as("MANAGER"), {})).statusCode).toBe(
        403,
      );
      const res = await call("POST", `/leads/${id}/email/mark-sent`, admin, {
        messageId: "<vu-dans-brevo@x>",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().email).toMatchObject({ status: "Envoyé" });
      expect(res.json().email.sentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [m] = await t.db.select().from(emailMessages);
      expect(m).toMatchObject({ status: "Envoyé", providerMessageId: "<vu-dans-brevo@x>", sendError: null });
      expect(sender.sent).toHaveLength(1); // aucun renvoi
      expect(await t.db.$count(leadEvents, eq(leadEvents.type, "email_marked_sent"))).toBe(1);
      expect(await t.db.$count(auditEvents, eq(auditEvents.action, "emails.marked_sent"))).toBe(1);
      // plus rien à marquer, ni à libérer
      expect((await call("POST", `/leads/${id}/email/mark-sent`, admin, {})).statusCode).toBe(409);
      expect((await call("POST", `/leads/${id}/email/release`, admin)).statusCode).toBe(409);
    });

    it("les retours Brevo suivants s'appliquent grâce à l'identifiant fourni", async () => {
      await uncertain();
      const admin = await as("ADMIN");
      const id = await leadId(admin, "Alpha");
      await call("POST", `/leads/${id}/email/mark-sent`, admin, { messageId: "<vu-dans-brevo@x>" });
      await t.app.inject({
        method: "POST",
        url: `/webhooks/brevo/${"w".repeat(32)}`,
        payload: { event: "delivered", email: "alpha@alpha.fr", "message-id": "<vu-dans-brevo@x>" },
      });
      expect((await t.db.select().from(emailMessages))[0]?.status).toBe("Délivré");
    });

    it("refuse pour un e-mail qui n'est pas en attente de résultat", async () => {
      await seed([row("Alpha", { "Validation mail": "Validé" })]);
      const admin = await as("ADMIN");
      expect(
        (await call("POST", `/leads/${await leadId(admin, "Alpha")}/email/mark-sent`, admin, {})).statusCode,
      ).toBe(409);
    });
  });

  describe("annuler un lot groupé", () => {
    const three = () => seed([row("Alpha"), row("Bravo"), row("Charlie")]);
    const apply = async (c: string, validation: "Validé" | "Rejeté") =>
      (await call("POST", "/emails/bulk", c, { validation, filter: {}, expectedCount: 3 })).json();

    it("remet à relire tout le lot et trace l'annulation", async () => {
      await three();
      const c = await as("MANAGER");
      const done = await apply(c, "Validé");
      expect(done.batchId).toMatch(/^[0-9a-f-]{36}$/);
      expect(
        (await call("POST", "/emails/bulk", c, { validation: "Validé", filter: {}, dryRun: true })).json()
          .batchId,
      ).toBeNull();
      const undo = await call("POST", `/emails/bulk/${done.batchId}/undo`, c);
      expect(undo.json()).toEqual({ reverted: 3, skipped: 0 });
      const all = await t.db.select().from(emailMessages);
      expect(
        all.every((m) => m.validation === "Pas Validé" && m.validatedAt === null && m.bulkBatch === null),
      ).toBe(true);
      expect(await t.db.$count(leadEvents, eq(leadEvents.type, "email_validation"))).toBe(6); // 3 validations + 3 annulations
      expect(await t.db.$count(auditEvents, eq(auditEvents.action, "emails.bulk_undo"))).toBe(1);
      // un lot annulé ne s'annule pas deux fois
      expect((await call("POST", `/emails/bulk/${done.batchId}/undo`, c)).statusCode).toBe(404);
    });

    it("annule aussi un rejet groupé", async () => {
      await three();
      const c = await as("MANAGER");
      const done = await apply(c, "Rejeté");
      expect((await call("POST", `/emails/bulk/${done.batchId}/undo`, c)).json().reverted).toBe(3);
    });

    it("ne touche pas un e-mail modifié à la main depuis, ni un e-mail déjà parti", async () => {
      await three();
      const c = await as("MANAGER");
      const done = await apply(c, "Validé");
      // Bravo : décision individuelle depuis (rejet) ; Charlie : parti entre-temps
      await call("PATCH", `/leads/${await leadId(c, "Bravo")}/email`, c, { validation: "Rejeté" });
      await t.db
        .update(emailMessages)
        .set({ status: "Envoyé", sentOn: "2026-10-12" })
        .where(eq(emailMessages.leadId, await leadId(c, "Charlie")));
      const undo = await call("POST", `/emails/bulk/${done.batchId}/undo`, c);
      expect(undo.json()).toEqual({ reverted: 1, skipped: 1 });
      const byName = async (n: string) =>
        (
          await t.db
            .select()
            .from(emailMessages)
            .where(eq(emailMessages.leadId, await leadId(c, n)))
        )[0];
      expect((await byName("Alpha"))?.validation).toBe("Pas Validé");
      expect((await byName("Bravo"))?.validation).toBe("Rejeté");
      expect((await byName("Charlie"))?.validation).toBe("Validé");
    });

    it("est réservé aux responsables", async () => {
      await three();
      const done = await apply(await as("MANAGER"), "Validé");
      expect((await call("POST", `/emails/bulk/${done.batchId}/undo`, await as("AGENT"))).statusCode).toBe(
        403,
      );
    });
  });

  describe("liste des adresses exclues", () => {
    it("pagine, recherche, filtre par motif et compte par motif", async () => {
      await t.db.insert(suppressions).values([
        { email: "a@alpha.fr", reason: "bounce" },
        { email: "b@bravo.fr", reason: "unsubscribe", note: "lien" },
        { email: "c@alpha.fr", reason: "manual", note: "a répondu stop" },
        { email: "d_%@x.fr", reason: "complaint" },
      ]);
      const c = await as("MANAGER");
      const all = (await call("GET", "/suppressions?limit=2", c)).json();
      expect(all).toMatchObject({ total: 4, limit: 2, offset: 0 });
      expect(all.items).toHaveLength(2);
      expect(all.byReason).toEqual({ bounce: 1, unsubscribe: 1, manual: 1, complaint: 1 });
      expect((await call("GET", "/suppressions?q=alpha", c)).json().total).toBe(2);
      expect((await call("GET", "/suppressions?reason=manual", c)).json().items[0]).toMatchObject({
        email: "c@alpha.fr",
        note: "a répondu stop",
      });
      // les caractères spéciaux de recherche sont littéraux
      expect((await call("GET", "/suppressions?q=%25", c)).json().total).toBe(1);
      expect((await call("GET", "/suppressions", await as("AGENT"))).statusCode).toBe(403);
    });
  });

  describe("réglages de l'e-mail et de l'envoi", () => {
    it("affiche les valeurs du serveur, sans aucun secret", async () => {
      const c = await as("MANAGER");
      const res = await call("GET", "/settings/mail", c);
      const s = res.json();
      expect(s.overridden).toEqual([]);
      expect(s.values).toEqual(s.defaults);
      expect(s.serverOnly).toEqual({
        fromAddress: "equipe@exemple.fr",
        testRecipient: "test@exemple.fr",
        mode: "prod",
        configured: true,
      });
      for (const secret of ["cle-de-test", "w".repeat(32), "u".repeat(40)])
        expect(res.body).not.toContain(secret);
      expect((await call("GET", "/settings/mail", await as("AGENT"))).statusCode).toBe(403);
    });

    it("modifier est réservé aux administrateurs, s'applique à l'aperçu et peut être réinitialisé", async () => {
      const admin = await as("ADMIN");
      const manager = await as("MANAGER");
      expect((await call("PUT", "/settings/mail", manager, { signature: "X Y\nZ" })).statusCode).toBe(403);
      const put = await call("PUT", "/settings/mail", admin, {
        signature: "Marie Test\nResponsable",
        optOutText: "Pour ne plus recevoir nos messages, répondez STOP à cet e-mail.",
        dailyCap: 20,
      });
      expect(put.statusCode).toBe(200);
      expect(put.json().overridden.sort()).toEqual(["dailyCap", "optOutText", "signature"]);
      expect(put.json().values.dailyCap).toBe(20);
      expect(put.json().defaults.dailyCap).toBe(50);
      const preview = (
        await call("POST", "/emails/preview", manager, {
          subject: "Objet de test",
          body: "Bonjour,\n\nTexte.",
        })
      ).json();
      expect(preview.text).toContain("Marie Test\nResponsable");
      expect(preview.text).toContain("répondez STOP");
      expect((await call("GET", "/emails/send-status", manager)).json().dailyCap).toBe(20);
      expect(await t.db.$count(auditEvents, eq(auditEvents.action, "settings.mail_updated"))).toBe(1);
      // retour aux valeurs du serveur
      const reset = await call("PUT", "/settings/mail", admin, {
        signature: null,
        optOutText: null,
        dailyCap: null,
      });
      expect(reset.json().overridden).toEqual([]);
      expect(
        (await call("POST", "/emails/preview", manager, { subject: "Objet de test", body: "Bonjour" })).json()
          .text,
      ).toContain("Traffic Manager");
    });

    it("l'envoi de test utilise les réglages modifiés (signature, mention d'opposition)", async () => {
      await seed([row("Alpha", { "Validation mail": "Validé" })]);
      const admin = await as("ADMIN");
      await call("PUT", "/settings/mail", admin, { signature: "Marie Test\nResponsable" });
      const id = await leadId(admin, "Alpha");
      expect((await call("POST", "/emails/test-send", admin, { leadId: id })).statusCode).toBe(200);
      expect(sender.sent[0]?.text).toContain("Marie Test\nResponsable");
    });

    it("refuse les valeurs dangereuses : mention d'opposition trop courte, plafond absurde, créneau mal écrit, requête vide", async () => {
      const admin = await as("ADMIN");
      for (const bad of [
        { optOutText: "stop" },
        { dailyCap: 0 },
        { dailyCap: 100000 },
        { intervalSeconds: 1 },
        { slots: "lundi 14h" },
        { slots: "mon@25:00" },
        {},
      ]) {
        expect((await call("PUT", "/settings/mail", admin, bad)).statusCode, JSON.stringify(bad)).toBe(400);
      }
      expect((await call("GET", "/settings/mail", admin)).json().overridden).toEqual([]);
    });

    it("le plafond et les créneaux modifiés sont ceux qu'applique l'envoi", async () => {
      await seed([
        row("Alpha", { "Validation mail": "Validé" }),
        row("Bravo", { "Validation mail": "Validé" }),
      ]);
      const admin = await as("ADMIN");
      await call("PUT", "/settings/mail", admin, { dailyCap: 1 });
      expect((await sendTick({ db: t.db, config: t.config, sender, now: IN_SLOT })).kind).toBe("sent");
      await t.db.execute(
        `update email_messages set sent_at = now() - interval '1 hour', sending_at = now() - interval '1 hour' where sent_at is not null` as never,
      );
      expect(await sendTick({ db: t.db, config: t.config, sender, now: IN_SLOT })).toMatchObject({
        reason: "plafond du jour atteint",
      });
      await call("PUT", "/settings/mail", admin, { dailyCap: null, slots: "fri@18:00" });
      expect(await sendTick({ db: t.db, config: t.config, sender, now: IN_SLOT })).toMatchObject({
        reason: "hors créneau",
      });
    });
  });
});
