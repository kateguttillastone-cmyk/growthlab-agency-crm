import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("exige DATABASE_URL", () => {
    expect(() => loadConfig({ NODE_ENV: "test" })).toThrow(/DATABASE_URL/);
  });

  it("active cookie sécurisé et proxy de confiance en production", () => {
    const c = loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
      APP_ORIGIN: "https://crm.exemple.fr",
    });
    expect(c.COOKIE_SECURE).toBe(true);
    expect(c.TRUST_PROXY).toBe(true);
    expect(c.SWAGGER).toBe(false);
  });

  it("refuse une origine http en production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://x",
        APP_ORIGIN: "http://crm.exemple.fr",
      }),
    ).toThrow(/https/);
  });

  it("traite des valeurs de graine vides comme absentes", () => {
    const c = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://x",
      SEED_ADMIN_EMAIL: "",
      SEED_ADMIN_PASSWORD: "",
    });
    expect(c.SEED_ADMIN_EMAIL).toBeUndefined();
    expect(c.SEED_ADMIN_PASSWORD).toBeUndefined();
  });
});
