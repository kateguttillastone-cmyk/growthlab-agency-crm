import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

describe("préférences d'affichage du compte", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  const call = (method: "GET" | "PUT", cookie: string | undefined, payload?: object) =>
    t.app.inject({
      method,
      url: "/auth/preferences",
      headers: withOrigin(cookie),
      ...(payload ? { payload } : {}),
    });

  it("exige d'être connecté", async () => {
    expect((await call("GET", undefined)).statusCode).toBe(401);
  });

  it("démarre vide, fusionne les changements et reste propre à chaque compte", async () => {
    const a = await createUser(t, "AGENT");
    const b = await createUser(t, "AGENT");
    const ca = await login(t, a.email);
    const cb = await login(t, b.email);
    expect((await call("GET", ca)).json()).toEqual({});
    expect((await call("PUT", ca, { theme: "dark" })).json()).toEqual({ theme: "dark" });
    expect((await call("PUT", ca, { reducedMotion: true })).json()).toEqual({
      theme: "dark",
      reducedMotion: true,
    });
    expect((await call("GET", ca)).json()).toEqual({ theme: "dark", reducedMotion: true });
    expect((await call("GET", cb)).json()).toEqual({});
  });

  it("refuse une valeur inconnue", async () => {
    const a = await createUser(t, "AGENT");
    const ca = await login(t, a.email);
    expect((await call("PUT", ca, { theme: "sepia" })).statusCode).toBe(400);
  });
});
