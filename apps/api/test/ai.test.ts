import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AiClient, anthropicClient } from "../src/ai/anthropic";
import { PROMPT_VERSION } from "../src/ai/prompts";
import { companies, contacts, emailMessages, leadEvents, leads } from "../src/db/schema";
import type { PollResult, SourcingProvider } from "../src/sourcing/provider";
import { sourcingTick } from "../src/sourcing/service";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

const GOOD = {
  segment: "PME/TPE",
  qualification: "Chaud",
  qualificationReason: "12 salariés, site sans SSL détecté, bonne réputation locale.",
  service: "Refonte de site",
  emailSubject: "Votre site mérite autant que vos avis Google",
  emailBody: `Bonjour Léa,\n\n${"Texte de prospection fictif. ".repeat(6)}\n\nBien cordialement,`,
};

class FakeAi implements AiClient {
  calls: Array<{ system: string; user: string; toolName: string }> = [];
  next: unknown = GOOD;
  fail: string | null = null;
  async structured(o: { system: string; user: string; toolName: string }) {
    this.calls.push(o);
    if (this.fail) throw new Error(this.fail);
    return this.next;
  }
}

describe("IA : qualification et rédaction des e-mails", () => {
  let t: TestApp;
  const ai = new FakeAi();
  beforeAll(async () => {
    t = await createTestApp({ AI_DAILY_LIMIT: "3" }, undefined, null, null, ai);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t);
    ai.calls = [];
    ai.next = GOOD;
    ai.fail = null;
  });

  const call = (method: "GET" | "POST", url: string, cookie: string, payload?: object) =>
    t.app.inject({ method, url, headers: withOrigin(cookie), ...(payload ? { payload } : {}) });

  async function seedLead(over: { website?: string | null; email?: string | null } = {}) {
    const [company] = await t.db
      .insert(companies)
      .values({
        name: "Garage Test",
        nameKey: "garage test",
        domain: over.website === null ? null : "garage-test.example",
        website: over.website === null ? null : "https://garage-test.example",
        sector: "Garagiste",
        employees: 12,
        city: "Annecy",
        phone: "+33450000000",
        hasSsl: false,
      })
      .returning({ id: companies.id });
    const [contact] = await t.db
      .insert(contacts)
      .values({
        companyId: company?.id as string,
        firstName: "Léa",
        lastName: "Durand",
        nameKey: "lea durand",
        email: over.email === undefined ? "lea@garage-test.example" : over.email,
      })
      .returning({ id: contacts.id });
    const [lead] = await t.db
      .insert(leads)
      .values({ companyId: company?.id as string, contactId: contact?.id as string, source: "Test" })
      .returning({ id: leads.id });
    return lead?.id as string;
  }
  const manager = async () => login(t, (await createUser(t, "MANAGER")).email);

  it("qualifie, choisit le service et rédige un e-mail à relire, sans envoyer de donnée personnelle à l'IA", async () => {
    const m = await manager();
    const id = await seedLead();
    const res = await call("POST", `/leads/${id}/score`, m);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      noWebsite: false,
      qualification: "Chaud",
      service: "Refonte de site",
      emailWritten: true,
    });

    const [lead] = await t.db.select().from(leads).where(eq(leads.id, id));
    expect(lead).toMatchObject({ qualification: "Chaud", service: "Refonte de site" });
    expect(lead?.qualificationReason).toMatch(/12 salariés/);
    const [mail] = await t.db.select().from(emailMessages).where(eq(emailMessages.leadId, id));
    expect(mail).toMatchObject({ validation: "Pas Validé", status: null, promptVersion: PROMPT_VERSION });
    const ev = await t.db.select().from(leadEvents).where(eq(leadEvents.leadId, id));
    expect(ev.some((e) => e.type === "scored")).toBe(true);

    // minimisation : ni adresse e-mail ni téléphone dans la demande envoyée à l'IA
    const sent = `${ai.calls[0]?.system}\n${ai.calls[0]?.user}`;
    expect(sent).not.toContain("lea@garage-test.example");
    expect(sent).not.toContain("+33450000000");
    expect(sent).toContain("Garage Test");
  });

  it("sans site web : service « Création de site » sans appeler l'IA", async () => {
    const m = await manager();
    const id = await seedLead({ website: null });
    const res = await call("POST", `/leads/${id}/score`, m);
    expect(res.json()).toMatchObject({ noWebsite: true, service: "Création de site", emailWritten: false });
    expect(ai.calls).toHaveLength(0);
    const [lead] = await t.db.select().from(leads).where(eq(leads.id, id));
    expect(lead).toMatchObject({ service: "Création de site", qualification: null });
  });

  it("n'écrase jamais un e-mail déjà validé", async () => {
    const m = await manager();
    const id = await seedLead();
    await t.db
      .insert(emailMessages)
      .values({ leadId: id, subject: "Objet validé", body: "Corps validé", validation: "Validé" });
    const res = await call("POST", `/leads/${id}/score`, m);
    expect(res.json().emailWritten).toBe(false);
    const [mail] = await t.db.select().from(emailMessages).where(eq(emailMessages.leadId, id));
    expect(mail).toMatchObject({ subject: "Objet validé", validation: "Validé" });
  });

  it("une réponse invalide ou une erreur de l'IA n'écrit rien", async () => {
    const m = await manager();
    const id = await seedLead();
    ai.next = { ...GOOD, qualification: "Brûlant" };
    expect((await call("POST", `/leads/${id}/score`, m)).statusCode).toBe(500);
    ai.fail = "Anthropic a répondu 429 (trop de requêtes ou quota atteint)";
    expect((await call("POST", `/leads/${id}/score`, m)).statusCode).toBe(500);
    const [lead] = await t.db.select().from(leads).where(eq(leads.id, id));
    expect(lead?.qualification).toBeNull();
    expect(await t.db.$count(emailMessages)).toBe(0);
  });

  it("plafond quotidien d'appels, réservé aux responsables, indisponible sans clé", async () => {
    const m = await manager();
    const id = await seedLead();
    for (let i = 0; i < 3; i++) expect((await call("POST", `/leads/${id}/score`, m)).statusCode).toBe(200);
    const over = await call("POST", `/leads/${id}/score`, m);
    expect(over.statusCode).toBe(409);
    expect(over.json().error.message).toMatch(/Plafond quotidien/);
    expect((await call("GET", "/ai/status", m)).json()).toMatchObject({
      configured: true,
      usedToday: 3,
      dailyLimit: 3,
    });
    const agent = await login(t, (await createUser(t, "AGENT")).email);
    expect((await call("POST", `/leads/${id}/score`, agent)).statusCode).toBe(403);
  });

  it("réécrit un e-mail selon une consigne sans l'enregistrer", async () => {
    const m = await manager();
    const id = await seedLead();
    await t.db
      .insert(emailMessages)
      .values({ leadId: id, subject: "Objet d'origine", body: "Corps d'origine" });
    ai.next = {
      emailSubject: "Un objet plus court et plus direct",
      emailBody: `Bonjour Léa,\n\n${"Version plus courte. ".repeat(6)}\n\nBien cordialement,`,
    };
    const res = await call("POST", `/leads/${id}/email/rewrite`, m, {
      instruction: "Plus court et plus direct",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().subject).toBe("Un objet plus court et plus direct");
    const [mail] = await t.db.select().from(emailMessages).where(eq(emailMessages.leadId, id));
    expect(mail?.subject).toBe("Objet d'origine"); // rien d'enregistré : la personne relit puis valide
    expect(ai.calls[0]?.user).toContain("Plus court et plus direct");
    expect((await call("POST", `/leads/${id}/email/rewrite`, m, { instruction: "ok" })).statusCode).toBe(400);
  });

  it("après une recherche de sourcing, les prospects trouvés sont qualifiés automatiquement", async () => {
    const provider: SourcingProvider = {
      start: async () => ({ providerRunId: "r1" }),
      poll: async (): Promise<PollResult> => ({
        state: "succeeded",
        items: [
          {
            companyName: "Auto Un",
            website: "https://auto-un.example",
            phone: "04 50 11 11 11",
            city: "Annecy",
            sector: "Garagiste",
            firstName: "Jo",
            email: "jo@auto-un.example",
          },
          { companyName: "Auto Deux", phone: "04 50 22 22 22", city: "Lyon" },
        ],
      }),
      abort: async () => undefined,
    };
    const [run] = await t.db
      .insert((await import("../src/db/schema")).sourcingRuns)
      .values({
        criteria: {
          source: "linkedin",
          query: "Garagiste",
          cities: ["Annecy"],
          maxResults: 5,
          noWebsiteOnly: false,
        },
        estimatedCost: 0.1,
      })
      .returning();
    expect(run).toBeTruthy();
    await sourcingTick({ db: t.db, config: t.config, provider, ai });
    const all = await t.db.select().from(leads);
    expect(all).toHaveLength(2);
    expect(all.filter((l) => l.qualification === "Chaud")).toHaveLength(1); // avec site : IA
    expect(all.filter((l) => l.service === "Création de site")).toHaveLength(1); // sans site : règle fixe
    expect(ai.calls).toHaveLength(1);
  });
});

describe("client Anthropic", () => {
  const KEY = "sk-ant-SECRET-de-test";
  const mk = (res: Response) => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const f = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return res;
    }) as unknown as typeof fetch;
    return { client: anthropicClient({ apiKey: KEY, model: "modele-test", fetch: f }), seen };
  };
  const opts = {
    system: "s",
    user: "u",
    toolName: "outil",
    toolDescription: "d",
    schema: { type: "object" },
  };

  it("force l'outil, envoie la clé en en-tête et renvoie l'objet structuré", async () => {
    const { client, seen } = mk(
      new Response(JSON.stringify({ content: [{ type: "tool_use", name: "outil", input: { a: 1 } }] })),
    );
    expect(await client.structured(opts)).toEqual({ a: 1 });
    const body = JSON.parse(String(seen[0]?.init.body));
    expect(body).toMatchObject({ model: "modele-test", tool_choice: { type: "tool", name: "outil" } });
    expect((seen[0]?.init.headers as Record<string, string>)["x-api-key"]).toBe(KEY);
    expect(seen[0]?.url).not.toContain(KEY);
  });

  it("explique les erreurs sans jamais citer la clé", async () => {
    for (const [status, re] of [
      [401, /clé refusée/],
      [429, /quota/],
      [529, /surchargé/],
    ] as const) {
      const { client } = mk(
        new Response(JSON.stringify({ error: { message: `invalid ${KEY}` } }), { status }),
      );
      const err = (await client.structured(opts).catch((e: Error) => e)) as Error;
      expect(err.message).toMatch(re);
      expect(err.message).not.toContain(KEY);
    }
    const { client } = mk(new Response(JSON.stringify({ content: [{ type: "text", text: "bonjour" }] })));
    await expect(client.structured(opts)).rejects.toThrow(/illisible/);
  });
});
