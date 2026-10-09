import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, sessions } from "../src/db/schema";
import { ensureSeedAdmin } from "../src/seed";
import {
  createTestApp,
  createUser,
  DEFAULT_PASSWORD,
  login,
  resetDb,
  type TestApp,
  withOrigin,
} from "./helpers";

describe("gestion des utilisateurs et des rôles", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const call = (method: "GET" | "POST" | "PATCH", url: string, cookie?: string, payload?: object) =>
    t.app.inject({ method, url, headers: withOrigin(cookie), ...(payload ? { payload } : {}) });

  const newUser = {
    email: "Nouvelle@Example.com",
    name: "Nouvelle Personne",
    role: "AGENT",
    password: "Mot-de-passe-initial-1",
  };

  it("exige une authentification puis le rôle ADMIN", async () => {
    expect((await call("GET", "/users")).statusCode).toBe(401);
    for (const role of ["VIEWER", "AGENT", "MANAGER"] as const) {
      const u = await createUser(t, role);
      const cookie = await login(t, u.email);
      expect((await call("GET", "/users", cookie)).statusCode).toBe(403);
      expect((await call("POST", "/users", cookie, newUser)).statusCode).toBe(403);
      expect((await call("GET", "/audit-events", cookie)).statusCode).toBe(403);
    }
  });

  it("crée un utilisateur (e-mail normalisé), ne renvoie jamais le mot de passe et journalise", async () => {
    const admin = await createUser(t, "ADMIN");
    const cookie = await login(t, admin.email);
    const res = await call("POST", "/users", cookie, newUser);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ email: "nouvelle@example.com", role: "AGENT", active: true });
    expect(JSON.stringify(res.json())).not.toMatch(/password/i);
    // le nouveau compte peut se connecter
    expect(await login(t, "nouvelle@example.com", newUser.password)).toContain("gac_session=");
    const events = await t.db.select().from(auditEvents).where(eq(auditEvents.action, "user.created"));
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).not.toContain(newUser.password);
  });

  it("refuse un doublon d'e-mail (sans tenir compte de la casse) et un mot de passe faible", async () => {
    const admin = await createUser(t, "ADMIN");
    const cookie = await login(t, admin.email);
    await call("POST", "/users", cookie, newUser);
    const dup = await call("POST", "/users", cookie, { ...newUser, email: "NOUVELLE@example.com" });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("CONFLICT");
    const weak = await call("POST", "/users", cookie, {
      ...newUser,
      email: "autre@example.com",
      password: "court",
    });
    expect(weak.statusCode).toBe(400);
  });

  it("liste avec pagination, recherche et filtres", async () => {
    const admin = await createUser(t, "ADMIN", { name: "Kate Admin" });
    for (let i = 0; i < 5; i++) await createUser(t, "AGENT", { name: `Agent ${i}` });
    await createUser(t, "VIEWER", { active: false });
    const cookie = await login(t, admin.email);

    const page = (await call("GET", "/users?limit=3&offset=0", cookie)).json();
    expect(page.total).toBe(7);
    expect(page.items).toHaveLength(3);
    expect((await call("GET", "/users?role=AGENT", cookie)).json().total).toBe(5);
    expect((await call("GET", "/users?active=false", cookie)).json().total).toBe(1);
    expect((await call("GET", "/users?q=kate", cookie)).json().items[0].name).toBe("Kate Admin");
    expect((await call("GET", "/users?limit=1000", cookie)).statusCode).toBe(400);
  });

  it("traite % et _ comme des caractères ordinaires dans la recherche", async () => {
    const admin = await createUser(t, "ADMIN", { name: "Admin" });
    await createUser(t, "AGENT", { name: "Remise 100% garantie" });
    await createUser(t, "AGENT", { name: "Autre personne" });
    const cookie = await login(t, admin.email);
    const res = (await call("GET", `/users?q=${encodeURIComponent("100%")}`, cookie)).json();
    expect(res.total).toBe(1);
    expect((await call("GET", `/users?q=${encodeURIComponent("%")}`, cookie)).json().total).toBe(1);
  });

  it("modifie un utilisateur et ferme ses sessions à la désactivation ou au changement de rôle", async () => {
    const admin = await createUser(t, "ADMIN");
    const agent = await createUser(t, "AGENT");
    const adminCookie = await login(t, admin.email);
    const agentCookie = await login(t, agent.email);

    const res = await call("PATCH", `/users/${agent.id}`, adminCookie, { role: "MANAGER" });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("MANAGER");
    expect(
      (await t.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: agentCookie } })).statusCode,
    ).toBe(401);

    const again = await login(t, agent.email);
    await call("PATCH", `/users/${agent.id}`, adminCookie, { active: false });
    expect(
      (await t.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: again } })).statusCode,
    ).toBe(401);
    expect(await t.db.select().from(sessions).where(eq(sessions.userId, agent.id))).toHaveLength(0);

    expect((await call("PATCH", `/users/${agent.id}`, adminCookie, {})).statusCode).toBe(400);
    expect(
      (await call("PATCH", "/users/00000000-0000-4000-8000-000000000000", adminCookie, { name: "X" }))
        .statusCode,
    ).toBe(404);
  });

  it("protège le dernier administrateur et l'auto-désactivation", async () => {
    const admin = await createUser(t, "ADMIN");
    const cookie = await login(t, admin.email);
    expect((await call("PATCH", `/users/${admin.id}`, cookie, { role: "AGENT" })).statusCode).toBe(409);
    expect((await call("PATCH", `/users/${admin.id}`, cookie, { active: false })).statusCode).toBe(409);

    const second = await createUser(t, "ADMIN");
    // avec un second administrateur, on peut rétrograder l'autre, mais pas soi-même
    expect((await call("PATCH", `/users/${second.id}`, cookie, { role: "AGENT" })).statusCode).toBe(200);
    expect((await call("PATCH", `/users/${admin.id}`, cookie, { active: false })).statusCode).toBe(409);
  });

  it("réinitialise un mot de passe, déverrouille le compte et ferme les sessions", async () => {
    const admin = await createUser(t, "ADMIN");
    const agent = await createUser(t, "AGENT");
    const cookie = await login(t, admin.email);
    const agentCookie = await login(t, agent.email);
    const res = await call("POST", `/users/${agent.id}/reset-password`, cookie, {
      password: "Reinitialise-12345",
    });
    expect(res.statusCode).toBe(204);
    expect(
      (await t.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: agentCookie } })).statusCode,
    ).toBe(401);
    expect(await login(t, agent.email, "Reinitialise-12345")).toContain("gac_session=");
    await expect(login(t, agent.email, DEFAULT_PASSWORD)).rejects.toThrow();
  });

  it("expose le journal d'audit aux administrateurs, filtrable", async () => {
    const admin = await createUser(t, "ADMIN");
    const cookie = await login(t, admin.email);
    await call("POST", "/users", cookie, newUser);
    const all = (await call("GET", "/audit-events", cookie)).json();
    expect(all.total).toBeGreaterThanOrEqual(2); // connexion + création
    const created = (await call("GET", "/audit-events?action=user.created", cookie)).json();
    expect(created.items).toHaveLength(1);
    expect(created.items[0].actorId).toBe(admin.id);
  });
});

describe("administrateur initial (seed)", () => {
  it("est créé une seule fois et n'est jamais modifié ensuite", async () => {
    const t = await createTestApp({
      SEED_ADMIN_EMAIL: "Root@Example.com",
      SEED_ADMIN_PASSWORD: "Mot-de-passe-racine-1",
    });
    await resetDb(t);
    const log = { info: () => {} };
    await ensureSeedAdmin(t.db, t.config, log);
    expect(await login(t, "root@example.com", "Mot-de-passe-racine-1")).toContain("gac_session=");

    // un second démarrage avec un autre mot de passe ne change rien
    const other = { ...t.config, SEED_ADMIN_PASSWORD: "Un-autre-mot-de-passe-9" };
    await ensureSeedAdmin(t.db, other, log);
    expect(await login(t, "root@example.com", "Mot-de-passe-racine-1")).toContain("gac_session=");
    await expect(login(t, "root@example.com", "Un-autre-mot-de-passe-9")).rejects.toThrow();
    await t.close();
  });

  it("ne fait rien sans variables de graine", async () => {
    const t = await createTestApp();
    await resetDb(t);
    await ensureSeedAdmin(t.db, t.config, { info: () => {} });
    const res = await t.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    await t.close();
  });
});
