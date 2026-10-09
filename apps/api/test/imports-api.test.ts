import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, contacts, leads, suppressions } from "../src/db/schema";
import { linkedinRow, mapsRow, toCsv } from "./fixtures/airtable-csv";
import {
  createTestApp,
  createUser,
  login,
  multipartBody,
  resetDb,
  type TestApp,
  withOrigin,
} from "./helpers";

describe("import du CSV par l'interface", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const csv = toCsv([
    linkedinRow(),
    linkedinRow({
      Prénom: "Paul",
      Nom: "Durand",
      Email: "paul@exemple-test.fr",
      Linkedin: "https://l/p",
      "Statut email": "Bounce",
    }),
    mapsRow(),
  ]);
  const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

  const send = async (
    cookie: string | undefined,
    fields: Record<string, string>,
    file: { name?: string; content: string | Buffer } | null = { content: csv },
    app: TestApp = t,
  ) => {
    const { payload, contentType } = multipartBody([
      ...Object.entries(fields).map(([name, value]) => ({ name, value })),
      ...(file ? [{ name: "file", filename: file.name ?? "export.csv", content: file.content }] : []),
    ]);
    return app.app.inject({
      method: "POST",
      url: "/imports/airtable",
      payload,
      headers: { ...withOrigin(cookie), "content-type": contentType },
    });
  };
  const admin = async () => login(t, (await createUser(t, "ADMIN")).email);
  const count = async () => (await t.db.select().from(leads)).length;

  it("est réservé aux administrateurs", async () => {
    expect((await send(undefined, { mode: "preview" })).statusCode).toBe(401);
    for (const role of ["VIEWER", "AGENT", "MANAGER"] as const) {
      const cookie = await login(t, (await createUser(t, role)).email);
      expect((await send(cookie, { mode: "preview" })).statusCode).toBe(403);
    }
    expect(await count()).toBe(0);
  });

  it("simule sans rien écrire, et renvoie un rapport sans donnée de prospect", async () => {
    const res = await send(await admin(), { mode: "preview" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      applied: false,
      file: { name: "export.csv", bytes: Buffer.byteLength(csv), sha256: sha(csv) },
      report: {
        dryRun: true,
        rows: 3,
        leads: { created: 3 },
        companies: { created: 2 },
        suppressions: { created: 1 },
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/exemple-test|Camille|Durand|Martin/);
    expect(await count()).toBe(0);
    expect(await t.db.select().from(suppressions)).toHaveLength(0);
  });

  it("n'importe qu'avec l'empreinte du fichier simulé", async () => {
    const cookie = await admin();
    const preview = (await send(cookie, { mode: "preview" })).json();

    // sans empreinte, ou avec celle d'un autre fichier : refusé, rien n'est écrit
    expect((await send(cookie, { mode: "apply" })).statusCode).toBe(409);
    const other = await send(
      cookie,
      { mode: "apply", confirmHash: preview.file.sha256 },
      { content: `${csv}\n` },
    );
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe("CONFLICT");
    expect(await count()).toBe(0);

    const applied = await send(cookie, { mode: "apply", confirmHash: preview.file.sha256 });
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toMatchObject({ applied: true, report: { dryRun: false, leads: { created: 3 } } });
    expect(await count()).toBe(3);
    expect(await t.db.select().from(suppressions)).toHaveLength(1);
  });

  it("est rejouable : un second import ne crée rien", async () => {
    const cookie = await admin();
    await send(cookie, { mode: "apply", confirmHash: sha(csv) });
    const again = (await send(cookie, { mode: "apply", confirmHash: sha(csv) })).json();
    expect(again.report.leads).toEqual({ created: 0, existing: 3 });
    expect(await count()).toBe(3);
  });

  it("deux imports simultanés du même fichier ne créent chaque ligne qu'une fois", async () => {
    const cookie = await admin();
    const results = await Promise.all([
      send(cookie, { mode: "apply", confirmHash: sha(csv) }),
      send(cookie, { mode: "apply", confirmHash: sha(csv) }),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(await count()).toBe(3);
    expect(await t.db.select().from(contacts)).toHaveLength(2);
  });

  it("journalise la simulation et l'import sans contenu du fichier", async () => {
    const cookie = await admin();
    await send(cookie, { mode: "preview" });
    await send(cookie, { mode: "apply", confirmHash: sha(csv) });
    const events = await t.db.select().from(auditEvents).where(eq(auditEvents.entityType, "import"));
    expect(events.map((e) => e.action).sort()).toEqual(["import.applied", "import.preview"]);
    expect(JSON.stringify(events)).not.toMatch(/exemple-test|Camille|camille/);
    expect(events[0]?.data).toMatchObject({ rows: 3 });
  });

  it("refuse les fichiers inexploitables avec un message clair", async () => {
    const cookie = await admin();
    const msg = async (r: Awaited<ReturnType<typeof send>>) =>
      [r.statusCode, r.json().error.message] as const;

    expect((await send(cookie, { mode: "preview" }, null)).statusCode).toBe(400); // pas de fichier
    expect((await send(cookie, { mode: "preview" }, { content: "" })).statusCode).toBe(400); // fichier vide
    expect((await send(cookie, {}, { content: csv })).statusCode).toBe(400); // pas de mode
    expect((await send(cookie, { mode: "preview", tz: "UTC" })).statusCode).toBe(400); // fuseau invalide

    const [s1, m1] = await msg(await send(cookie, { mode: "preview" }, { content: "a,b\n1,2\n" }));
    expect([s1, m1]).toEqual([422, expect.stringContaining("« Entreprise » est absente")]);

    const [s2, m2] = await msg(
      await send(cookie, { mode: "preview" }, { content: Buffer.from([0xff, 0xfe, 0x41, 0x2c, 0x42]) }),
    );
    expect([s2, m2]).toEqual([422, expect.stringContaining("UTF-8")]);

    const [s3, m3] = await msg(
      await send(cookie, { mode: "preview" }, { content: 'Entreprise,Email\n"ouvert,x\n' }),
    );
    expect(s3).toBe(422);
    expect(m3).toMatch(/illisible/);

    const [s4] = await msg(await send(cookie, { mode: "preview" }, { content: "Entreprise,Email\n" }));
    expect(s4).toBe(422); // en-tête seul : aucune ligne
    expect(await count()).toBe(0);
  });

  it("refuse un fichier trop volumineux", async () => {
    const small = await createTestApp({ IMPORT_MAX_MB: "1" });
    await resetDb(small);
    const cookie = await login(small, (await createUser(small, "ADMIN")).email);
    const big = `Entreprise\n${"x".repeat(1_500_000)}\n`;
    const res = await send(cookie, { mode: "preview" }, { content: big }, small);
    expect(res.statusCode).toBe(413);
    expect(res.json().error.message).toMatch(/trop volumineux.*1 Mo/);
    await small.close();
  });

  it("refuse un trop grand nombre de lignes et renvoie vers la commande", async () => {
    const cookie = await admin();
    const rows = `Entreprise\n${Array.from({ length: 20_001 }, (_, i) => `Société ${i}`).join("\n")}\n`;
    const res = await send(cookie, { mode: "preview" }, { content: rows });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/20\s?000.*commande/s);
  });

  it("limite la fréquence des imports", async () => {
    const limited = await createTestApp({ IMPORT_RATE_LIMIT_PER_MINUTE: "2" });
    await resetDb(limited);
    const cookie = await login(limited, (await createUser(limited, "ADMIN")).email);
    const codes: number[] = [];
    for (let i = 0; i < 3; i++)
      codes.push((await send(cookie, { mode: "preview" }, undefined, limited)).statusCode);
    expect(codes).toEqual([200, 200, 429]);
    await limited.close();
  });

  it("ne garde ni le chemin ni les caractères de contrôle du nom de fichier", async () => {
    const res = await send(
      await admin(),
      { mode: "preview" },
      { name: "..\\..\\etc\\passwd\u0007.csv", content: csv },
    );
    expect(res.json().file.name).toBe("passwd.csv");
  });
});
