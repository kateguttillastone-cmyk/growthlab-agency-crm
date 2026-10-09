import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sessions, users } from "../src/db/schema";
import { one } from "../src/lib/assert";
import {
  createTestApp,
  createUser,
  DEFAULT_PASSWORD,
  login,
  resetDb,
  type TestApp,
  withOrigin,
} from "./helpers";

describe("authentification", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const post = (url: string, payload: unknown, cookie?: string) =>
    t.app.inject({ method: "POST", url, payload: payload as object, headers: withOrigin(cookie) });

  it("connecte, pose un cookie HttpOnly SameSite=Lax et ne stocke que l'empreinte du jeton", async () => {
    const u = await createUser(t, "AGENT");
    const res = await post("/auth/login", { email: u.email.toUpperCase(), password: DEFAULT_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ id: u.id, role: "AGENT" });
    expect(res.json().user.passwordHash).toBeUndefined();
    const cookie = one(res.cookies.filter((c) => c.name === "gac_session"));
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(cookie.path).toBe("/");
    const s = one(await t.db.select().from(sessions));
    expect(s.tokenHash).not.toBe(cookie.value);
    expect(s.tokenHash).toHaveLength(64);
  });

  it("refuse un mauvais mot de passe avec un message identique à un e-mail inconnu", async () => {
    const u = await createUser(t);
    const bad = await post("/auth/login", { email: u.email, password: "faux-mot-de-passe" });
    const unknown = await post("/auth/login", {
      email: "inconnu@example.com",
      password: "faux-mot-de-passe",
    });
    expect(bad.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(bad.json()).toEqual(unknown.json());
    expect(bad.cookies).toHaveLength(0);
  });

  it("verrouille le compte après trop d'échecs, même avec le bon mot de passe", async () => {
    const u = await createUser(t);
    for (let i = 0; i < 3; i++) await post("/auth/login", { email: u.email, password: "faux" });
    const locked = await post("/auth/login", { email: u.email, password: DEFAULT_PASSWORD });
    expect(locked.statusCode).toBe(401);
    // le verrouillage expire
    await t.db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(users.id, u.id));
    const ok = await post("/auth/login", { email: u.email, password: DEFAULT_PASSWORD });
    expect(ok.statusCode).toBe(200);
  });

  it("refuse un compte désactivé", async () => {
    const u = await createUser(t, "AGENT", { active: false });
    const res = await post("/auth/login", { email: u.email, password: DEFAULT_PASSWORD });
    expect(res.statusCode).toBe(401);
  });

  it("GET /auth/me exige une session valide", async () => {
    const u = await createUser(t, "MANAGER");
    expect((await t.app.inject({ method: "GET", url: "/auth/me" })).statusCode).toBe(401);
    const cookie = await login(t, u.email);
    const me = await t.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: u.email, role: "MANAGER" });
  });

  it("ferme la session à la déconnexion", async () => {
    const u = await createUser(t);
    const cookie = await login(t, u.email);
    const out = await post("/auth/logout", {}, cookie);
    expect(out.statusCode).toBe(204);
    const me = await t.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect(await t.db.select().from(sessions)).toHaveLength(0);
  });

  it("refuse une session expirée par inactivité ou en durée absolue", async () => {
    const u = await createUser(t);
    const cookie = await login(t, u.email);
    await t.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await t.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } })).statusCode).toBe(
      401,
    );

    const cookie2 = await login(t, u.email);
    await t.db.update(sessions).set({ absoluteExpiresAt: new Date(Date.now() - 1000) });
    expect(
      (await t.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookie2 } })).statusCode,
    ).toBe(401);
  });

  it("invalide la session d'un utilisateur désactivé", async () => {
    const u = await createUser(t);
    const cookie = await login(t, u.email);
    await t.db.update(users).set({ active: false }).where(eq(users.id, u.id));
    expect((await t.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } })).statusCode).toBe(
      401,
    );
  });

  it("prolonge la session glissante quand elle est ancienne", async () => {
    const u = await createUser(t);
    const cookie = await login(t, u.email);
    const old = new Date(Date.now() - 10 * 60_000);
    await t.db.update(sessions).set({ lastSeenAt: old, expiresAt: new Date(Date.now() + 60_000) });
    await t.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    const s = one(await t.db.select().from(sessions));
    expect(s.lastSeenAt.getTime()).toBeGreaterThan(old.getTime());
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now() + 60 * 60_000);
  });

  it("change le mot de passe, déconnecte les autres appareils et garde la session courante", async () => {
    const u = await createUser(t);
    const current = await login(t, u.email);
    const other = await login(t, u.email);
    const bad = await post(
      "/auth/change-password",
      { currentPassword: "faux", newPassword: "Nouveau-mot-de-passe-2" },
      current,
    );
    expect(bad.statusCode).toBe(401);
    const weak = await post(
      "/auth/change-password",
      { currentPassword: DEFAULT_PASSWORD, newPassword: "court" },
      current,
    );
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error.code).toBe("VALIDATION_ERROR");

    const ok = await post(
      "/auth/change-password",
      { currentPassword: DEFAULT_PASSWORD, newPassword: "Nouveau-mot-de-passe-2" },
      current,
    );
    expect(ok.statusCode).toBe(204);
    expect(
      (await t.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: current } })).statusCode,
    ).toBe(200);
    expect(
      (await t.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: other } })).statusCode,
    ).toBe(401);
    expect((await post("/auth/login", { email: u.email, password: DEFAULT_PASSWORD })).statusCode).toBe(401);
    expect(
      (await post("/auth/login", { email: u.email, password: "Nouveau-mot-de-passe-2" })).statusCode,
    ).toBe(200);
  });

  it("rejette une requête de modification venant d'une autre origine", async () => {
    const u = await createUser(t);
    const res = await t.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: u.email, password: DEFAULT_PASSWORD },
      headers: { origin: "https://site-malveillant.example" },
    });
    expect(res.statusCode).toBe(403);
    const cross = await t.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: u.email, password: DEFAULT_PASSWORD },
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(cross.statusCode).toBe(403);
  });

  it("valide le corps de la requête", async () => {
    const res = await post("/auth/login", { email: "pas-un-email", password: "" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});

describe("limitation de débit de la connexion", () => {
  it("renvoie 429 après trop de tentatives", async () => {
    const t = await createTestApp({ LOGIN_RATE_LIMIT_PER_MINUTE: "3" });
    await resetDb(t);
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await t.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "x@example.com", password: "faux" },
        headers: withOrigin(),
      });
      codes.push(r.statusCode);
    }
    expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codes.slice(3)).toEqual([429, 429]);
    await t.close();
  });
});
