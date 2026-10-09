import type { Role } from "@gac/shared";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { type Config, loadConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { users } from "../src/db/schema";
import { one } from "../src/lib/assert";
import { hashPassword } from "../src/lib/password";
import type { DnsResolver } from "../src/mail/address-check";

export const DEFAULT_PASSWORD = "Un-mot-de-passe-solide-1";
const APP_ORIGIN = "http://localhost:5173";

export function testEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://gac:gac@localhost:5432/gac_test",
    APP_ORIGIN,
    LOGIN_RATE_LIMIT_PER_MINUTE: "1000",
    RATE_LIMIT_PER_MINUTE: "100000",
    IMPORT_RATE_LIMIT_PER_MINUTE: "1000",
    LOGIN_MAX_FAILURES: "3",
    LOGIN_LOCK_MINUTES: "15",
    ...overrides,
  };
}

export interface TestApp {
  app: FastifyInstance;
  config: Config;
  db: ReturnType<typeof createDb>["db"];
  close: () => Promise<void>;
}

export async function createTestApp(
  overrides: Record<string, string> = {},
  dnsResolver?: DnsResolver,
): Promise<TestApp> {
  const config = loadConfig(testEnv(overrides));
  const { db, pool } = createDb(config.DATABASE_URL);
  const app = await buildApp({ config, db, dnsResolver });
  await app.ready();
  return {
    app,
    config,
    db,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

/** Vide toutes les tables (la base de test est jetable). */
export async function resetDb(t: TestApp): Promise<void> {
  await t.db.execute(
    sql`truncate table lead_events, email_messages, suppressions, leads, contacts, companies, audit_events, sessions, users restart identity cascade`,
  );
}

let counter = 0;
export async function createUser(
  t: TestApp,
  role: Role = "AGENT",
  overrides: Partial<{ email: string; name: string; password: string; active: boolean }> = {},
) {
  counter += 1;
  const email = overrides.email ?? `user${counter}-${role.toLowerCase()}@example.com`;
  const rows = await t.db
    .insert(users)
    .values({
      email,
      name: overrides.name ?? `Utilisateur ${counter}`,
      role,
      passwordHash: await hashPassword(overrides.password ?? DEFAULT_PASSWORD),
      active: overrides.active ?? true,
    })
    .returning();
  return { ...one(rows), password: overrides.password ?? DEFAULT_PASSWORD };
}

/** Se connecte et renvoie la valeur du cookie de session (« gac_session=… »). */
export async function login(t: TestApp, email: string, password = DEFAULT_PASSWORD): Promise<string> {
  const res = await t.app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
    headers: { origin: APP_ORIGIN },
  });
  if (res.statusCode !== 200) throw new Error(`Connexion refusée (${res.statusCode}) : ${res.body}`);
  const c = res.cookies.find((x) => x.name === t.config.SESSION_COOKIE_NAME);
  if (!c) throw new Error("Cookie de session absent");
  return `${c.name}=${c.value}`;
}

export const withOrigin = (cookie?: string) => ({
  origin: APP_ORIGIN,
  ...(cookie ? { cookie } : {}),
});

export interface MultipartPart {
  name: string;
  /** Champ texte. */
  value?: string;
  /** Fichier : nom et contenu. */
  filename?: string;
  content?: Buffer | string;
}

/** Corps `multipart/form-data` construit à la main (aucune dépendance de test). */
export function multipartBody(parts: MultipartPart[]) {
  const boundary = `----gactest${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (p.filename !== undefined) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: text/csv\r\n\r\n`,
        ),
      );
      chunks.push(Buffer.isBuffer(p.content) ? p.content : Buffer.from(p.content ?? ""));
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(
        Buffer.from(`Content-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value ?? ""}\r\n`),
      );
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
