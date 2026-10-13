import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AiClient } from "../src/ai/anthropic";
import { companies, contacts, leads } from "../src/db/schema";
import { analyzeHtml } from "../src/enrich/analyze";
import { isPrivateAddress, type SiteFetcher, safeFetcher } from "../src/enrich/safe-fetch";
import { enrichCompany } from "../src/enrich/service";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

describe("analyse d'un site", () => {
  it("reconnaît CMS, e-commerce, suivi publicitaire et mobile", () => {
    const wp = analyzeHtml(
      `<html><head><meta name="viewport" content="width=device-width"><script src="/wp-content/themes/x.js"></script>
       <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234"></script>
       <script>fbq('init','123')</script><script>gtag('config','AW-123456789')</script></head></html>`,
      "https://exemple.test/",
    );
    expect(wp).toMatchObject({
      cms: "WordPress",
      hasViewport: true,
      hasGa4: true,
      hasMetaPixel: true,
      hasGoogleAds: true,
      hasSsl: true,
      isEcommerce: false,
    });
    const shop = analyzeHtml(`<link href="https://cdn.shopify.com/s/x.css">`, "http://boutique.test/");
    expect(shop).toMatchObject({ cms: "Shopify", isEcommerce: true, hasSsl: false, hasViewport: false });
    expect(analyzeHtml("<html><body>Bonjour</body></html>", "https://a.test/").cms).toBeNull();
  });
});

describe("protection contre l'accès au réseau interne", () => {
  it("refuse les adresses privées, locales et de métadonnées", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.5",
      "172.16.0.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "224.0.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("ne se connecte jamais à une adresse interne, quelle que soit sa forme", async () => {
    const f = safeFetcher();
    for (const u of [
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://localhost/",
      "ftp://exemple.test/",
      "http://user:mdp@exemple.test/",
      "pas une adresse",
    ]) {
      expect(await f(u), u).toBeNull();
    }
  });

  describe("avec un serveur local (autorisé pour le test seulement)", () => {
    let server: http.Server;
    let base: string;
    beforeAll(async () => {
      server = http.createServer((req, res) => {
        if (req.url === "/loop") return void res.writeHead(302, { location: "/loop" }).end();
        if (req.url === "/redir") return void res.writeHead(301, { location: "/final" }).end();
        if (req.url === "/big") return void res.writeHead(200).end("a".repeat(2_000_000));
        if (req.url === "/slow") return; // ne répond jamais
        res.writeHead(200, { "content-type": "text/html" }).end(`<html>${req.url}</html>`);
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => {
      server.closeAllConnections();
      server.close();
    });

    it("suit les redirections (3 au plus), plafonne la taille et abandonne les boucles", async () => {
      const f = safeFetcher({ allowPrivate: true });
      expect((await f(`${base}/redir`))?.html).toContain("/final");
      expect(await f(`${base}/loop`)).toBeNull();
      const big = await f(`${base}/big`);
      expect(big?.html.length ?? 0).toBeLessThanOrEqual(420_000);
    }, 20_000);
  });
});

describe("enrichissement d'une entreprise", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const company = async (over: Partial<typeof companies.$inferInsert> = {}) => {
    const [c] = await t.db
      .insert(companies)
      .values({
        name: "Site Test",
        nameKey: "site test",
        domain: "site-test.example",
        website: "https://site-test.example",
        ...over,
      })
      .returning();
    return c?.id as string;
  };
  const page =
    (html: string, url = "https://site-test.example/"): SiteFetcher =>
    async (u) =>
      u.startsWith("https://") && url.startsWith("https://")
        ? { url, status: 200, headers: {}, html }
        : u.startsWith("http://") && url.startsWith("http://")
          ? { url, status: 200, headers: {}, html }
          : null;
  const read = async (id: string) => (await t.db.select().from(companies).where(eq(companies.id, id)))[0];

  it("enregistre les signaux du site sans écraser une valeur connue", async () => {
    const id = await company({ cms: "Wix (BuiltWith)" });
    const f = page(`<meta name="viewport" content="x"><script src="/wp-content/a.js"></script>`);
    expect(await enrichCompany(t.db, f, id)).toBe("analyzed");
    expect(await read(id)).toMatchObject({
      siteStatus: "ok",
      hasViewport: true,
      hasSsl: true,
      hasGtm: false,
      cms: "Wix (BuiltWith)",
    });
  });

  it("repli sur http : le site n'a pas de certificat valable", async () => {
    const id = await company();
    await enrichCompany(t.db, page("<html></html>", "http://site-test.example/"), id);
    expect(await read(id)).toMatchObject({ siteStatus: "ok", hasSsl: false });
  });

  it("un site injoignable est noté, sans erreur", async () => {
    const id = await company();
    expect(await enrichCompany(t.db, async () => null, id)).toBe("analyzed");
    expect(await read(id)).toMatchObject({ siteStatus: "unreachable", hasSsl: null });
  });

  it("ne refait pas une analyse récente et ignore une entreprise sans site", async () => {
    const id = await company();
    let calls = 0;
    const f: SiteFetcher = async () => {
      calls++;
      return null;
    };
    await enrichCompany(t.db, f, id);
    const n = calls;
    expect(await enrichCompany(t.db, f, id)).toBe("fresh");
    expect(calls).toBe(n);
    const none = await company({ name: "Sans Site", nameKey: "sans site", domain: null, website: null });
    expect(await enrichCompany(t.db, f, none)).toBe("no_website");
    const later = new Date(Date.now() + 31 * 86_400_000);
    expect(await enrichCompany(t.db, f, id, later)).toBe("analyzed");
  });
});

describe("qualification : le prompt reçoit les signaux du site", () => {
  let t: TestApp;
  const seen: string[] = [];
  const ai: AiClient = {
    async structured(o) {
      seen.push(o.user);
      return {
        segment: "PME/TPE",
        qualification: "Tiède",
        qualificationReason: "Site WordPress sans balise mobile détecté.",
        service: "Refonte de site",
        emailSubject: "Votre site sur téléphone : un point rapide",
        emailBody: `Bonjour,\n\n${"Texte fictif de prospection. ".repeat(6)}\n\nBien cordialement,`,
      };
    },
  };
  beforeAll(async () => {
    t = await createTestApp({}, undefined, null, null, ai, async () => ({
      url: "https://prompt-test.example/",
      status: 200,
      headers: {},
      html: `<script src="/wp-content/x.js"></script>`,
    }));
  });
  afterAll(() => t.close());

  it("analyse puis qualifie, et le site analysé est visible dans les données", async () => {
    await resetDb(t);
    const [c] = await t.db
      .insert(companies)
      .values({
        name: "Prompt Test",
        nameKey: "prompt test",
        domain: "prompt-test.example",
        website: "https://prompt-test.example",
      })
      .returning();
    const [p] = await t.db
      .insert(contacts)
      .values({
        companyId: c?.id as string,
        firstName: "Ana",
        nameKey: "ana",
        email: "ana@prompt-test.example",
      })
      .returning();
    const [l] = await t.db
      .insert(leads)
      .values({ companyId: c?.id as string, contactId: p?.id as string, source: "Test" })
      .returning();
    const m = await login(t, (await createUser(t, "MANAGER")).email);
    const res = await t.app.inject({ method: "POST", url: `/leads/${l?.id}/score`, headers: withOrigin(m) });
    expect(res.statusCode).toBe(200);
    expect(seen[0]).toContain("CMS : WordPress");
    expect(seen[0]).toContain("Site accessible : oui");
    expect(seen[0]).toContain("Adapté au mobile (balise viewport) : non");
    expect(seen[0]).not.toContain("ana@prompt-test.example");
    const [after] = await t.db
      .select()
      .from(companies)
      .where(eq(companies.id, c?.id as string));
    expect(after).toMatchObject({ cms: "WordPress", siteStatus: "ok", hasViewport: false });
  });
});
