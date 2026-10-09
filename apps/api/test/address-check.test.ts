import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { contacts, emailMessages, leadEvents } from "../src/db/schema";
import { importAirtableCsv } from "../src/import/airtable";
import { checkDomain, checkLocally, type DnsResolver, splitAddress } from "../src/mail/address-check";
import { type AirtableRow, linkedinRow, toCsv } from "./fixtures/airtable-csv";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

const dnsError = (code: string) => Object.assign(new Error(code), { code });

/** DNS fictif : un tableau de domaines -> comportement. */
function fakeDns(
  table: Record<string, "mx" | "a" | "none" | "null-mx" | "timeout">,
): DnsResolver & { calls: string[] } {
  const calls: string[] = [];
  const r: DnsResolver & { calls: string[] } = {
    calls,
    async resolveMx(d) {
      calls.push(d);
      const v = table[d] ?? "none";
      if (v === "timeout") throw dnsError("ETIMEOUT");
      if (v === "mx") return [{ exchange: `mail.${d}`, priority: 10 }];
      if (v === "null-mx") return [{ exchange: "", priority: 0 }];
      throw dnsError("ENODATA");
    },
    async resolve4(d) {
      if (table[d] === "a") return ["192.0.2.1"];
      throw dnsError("ENODATA");
    },
    async resolve6() {
      throw dnsError("ENODATA");
    },
  };
  return r;
}

describe("contrôle d'adresse : unités", () => {
  it("repère les adresses mal formées", () => {
    for (const bad of [
      "a@b",
      "a@@b.fr",
      "@b.fr",
      "a b@c.fr",
      "a..b@c.fr",
      "a@-b.fr",
      "a@b.f",
      `${"x".repeat(65)}@c.fr`,
    ]) {
      expect(splitAddress(bad), bad).toBeNull();
    }
    expect(splitAddress("prenom.nom+test@sous.domaine.fr")).toEqual({
      local: "prenom.nom+test",
      domain: "sous.domaine.fr",
    });
  });

  it("repère les adresses jetables et laisse passer le reste", () => {
    expect(checkLocally("x@mailinator.com")).toBe("disposable");
    expect(checkLocally("x@exemple.fr")).toBeNull();
    expect(checkLocally("pas-une-adresse")).toBe("invalid_syntax");
  });

  it("domaine : MX, repli sur A, MX nul, absent, et panne = indéterminé", async () => {
    const dns = fakeDns({ "a.fr": "mx", "b.fr": "a", "c.fr": "none", "d.fr": "null-mx", "e.fr": "timeout" });
    expect(await checkDomain("a.fr", dns)).toBe("valid");
    expect(await checkDomain("b.fr", dns)).toBe("valid");
    expect(await checkDomain("c.fr", dns)).toBe("no_mail_server");
    expect(await checkDomain("d.fr", dns)).toBe("no_mail_server");
    expect(await checkDomain("e.fr", dns)).toBeNull();
  });
});

describe("contrôle d'adresse : API", () => {
  const dns = fakeDns({ "bon.fr": "mx", "mort.fr": "none", "panne.fr": "timeout" });
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({}, dns);
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const pending = (over: AirtableRow): AirtableRow =>
    linkedinRow({
      "Validation mail": "Pas Validé",
      "Statut email": "",
      "Email envoyé le": "",
      "Étape pipeline": "",
      ...over,
    });
  const row = (n: string, email: string, over: AirtableRow = {}) =>
    pending({ Entreprise: n, "Site web": `${n.toLowerCase()}.fr`, Email: email, Prénom: n, ...over });
  const manager = async () => login(t, (await createUser(t, "MANAGER")).email);
  const post = (url: string, cookie: string, payload: object = {}) =>
    t.app.inject({ method: "POST", url, payload, headers: withOrigin(cookie) });
  const patch = (url: string, cookie: string, payload: object) =>
    t.app.inject({ method: "PATCH", url, payload, headers: withOrigin(cookie) });
  const idOf = async (c: string, q: string) =>
    (await t.app.inject({ method: "GET", url: `/leads?q=${q}`, headers: withOrigin(c) })).json().items[0]
      .id as string;

  const seed = () =>
    importAirtableCsv(
      t.db,
      toCsv([
        row("Alpha", "a@bon.fr"),
        row("Bravo", "b@mort.fr"),
        row("Charlie", "c@mailinator.com"),
        row("Delta", "d@panne.fr"),
        row("Echo", "e@bon.fr", { "Validation mail": "Validé" }),
        linkedinRow({ Entreprise: "Envoyé", "Site web": "envoye.fr", Email: "z@mort.fr" }),
        row("Rejete", "r@mort.fr", { "Validation mail": "Rejeté" }),
      ]),
    );

  it("est réservé aux responsables", async () => {
    const agent = await login(t, (await createUser(t, "AGENT")).email);
    expect((await post("/emails/address-check", agent)).statusCode).toBe(403);
  });

  it("contrôle seulement les e-mails non envoyés et non rejetés, et mutualise les domaines", async () => {
    await seed();
    const c = await manager();
    const res = (await post("/emails/address-check", c)).json();
    expect(res).toMatchObject({ checked: 4, valid: 2, indeterminate: 1 });
    expect(res.invalid).toEqual({ no_mail_server: 1, disposable: 1 });
    expect(res.remaining).toBe(1); // Delta : DNS en panne, à recontrôler
    expect(dns.calls.filter((d) => d === "bon.fr")).toHaveLength(1); // un seul appel pour 2 adresses
    expect(dns.calls).not.toContain("mailinator.com");
    // envoyé et rejeté : jamais contrôlés
    const rows = await t.db.select({ e: contacts.email, k: contacts.emailCheck }).from(contacts);
    expect(rows.find((r) => r.e === "z@mort.fr")?.k).toBeNull();
    expect(rows.find((r) => r.e === "r@mort.fr")?.k).toBeNull();
    expect(rows.find((r) => r.e === "d@panne.fr")?.k).toBeNull();
  });

  it("ne refait pas un contrôle récent, mais refait un contrôle périmé", async () => {
    await seed();
    const c = await manager();
    await post("/emails/address-check", c);
    dns.calls.length = 0;
    await post("/emails/address-check", c);
    expect(dns.calls).toEqual(["panne.fr"]);
    await t.db
      .update(contacts)
      .set({ emailCheckedAt: new Date(Date.now() - 40 * 86_400_000) })
      .where(eq(contacts.email, "a@bon.fr"));
    dns.calls.length = 0;
    await post("/emails/address-check", c);
    expect(dns.calls).toContain("bon.fr");
  });

  it("interdit de valider (unitaire et groupé) une adresse inutilisable, mais autorise le rejet", async () => {
    await seed();
    const c = await manager();
    await post("/emails/address-check", c);
    const bravo = await idOf(c, "Bravo");
    const res = await patch(`/leads/${bravo}/email`, c, { validation: "Validé" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toContain("inutilisable");
    const dry = await post("/emails/bulk", c, { validation: "Validé", filter: {}, dryRun: true });
    expect(dry.json().eligible).toBe(2); // Alpha et Delta (non contrôlée : autorisée)
    expect(dry.json().skipped["Adresse inutilisable"]).toBe(2);
    expect((await patch(`/leads/${bravo}/email`, c, { validation: "Rejeté" })).statusCode).toBe(200);
    // le résumé de la liste expose le contrôle
    const list = (
      await t.app.inject({ method: "GET", url: "/leads?q=Bravo", headers: withOrigin(c) })
    ).json();
    expect(list.items[0].email.addressCheck).toBe("no_mail_server");
  });

  it("remet à relire un e-mail déjà validé dont l'adresse se révèle inutilisable", async () => {
    await importAirtableCsv(t.db, toCsv([row("Mort", "m@mort.fr", { "Validation mail": "Validé" })]));
    const c = await manager();
    const id = await idOf(c, "Mort");
    const before = await t.db.select().from(emailMessages);
    expect(before[0]?.validation).toBe("Validé");
    const res = (await post("/emails/address-check", c)).json();
    expect(res.revoked).toBe(1);
    const after = await t.db.select().from(emailMessages);
    expect(after[0]?.validation).toBe("Pas Validé");
    const ev = await t.db.select().from(leadEvents).where(eq(leadEvents.leadId, id));
    expect(ev.find((e) => e.type === "email_validation")?.data).toMatchObject({
      to: "Pas Validé",
      reason: "no_mail_server",
    });
  });

  it("expose les compteurs dans les statistiques", async () => {
    await seed();
    const c = await manager();
    const stats = async () =>
      (await t.app.inject({ method: "GET", url: "/emails/stats", headers: withOrigin(c) })).json();
    expect(await stats()).toMatchObject({ addressUnchecked: 5, addressInvalid: 0 });
    await post("/emails/address-check", c);
    expect(await stats()).toMatchObject({ addressUnchecked: 1, addressInvalid: 2 });
  });
});
