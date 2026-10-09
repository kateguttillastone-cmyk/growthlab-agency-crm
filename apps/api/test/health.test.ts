import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers";

describe("GET /health", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ APP_VERSION: "abc123" });
  });
  afterAll(() => t.close());

  it("répond 200 quand l'API et la base répondent", async () => {
    const res = await t.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: true, version: "abc123" });
  });

  it("n'exige aucune authentification et pose les en-têtes de sécurité", async () => {
    const res = await t.app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("répond 503 si la base ne répond plus", async () => {
    const broken = await createTestApp();
    // on ferme le pool : la requête SQL échoue
    await (broken.db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
    const res = await broken.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "degraded", db: false });
    await broken.app.close();
  });

  it("renvoie une erreur JSON homogène sur une route inconnue", async () => {
    const res = await t.app.inject({ method: "GET", url: "/nexiste-pas" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Route introuvable" } });
  });
});
