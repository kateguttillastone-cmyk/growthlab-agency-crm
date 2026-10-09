import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, onUnauthorized } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("client d'API", () => {
  it("renvoie le corps JSON d'une réponse réussie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, { user: { id: "1" } })));
    await expect(api("/auth/me")).resolves.toEqual({ user: { id: "1" } });
  });

  it("accepte une réponse 204 sans corps", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("transforme une erreur de l'API en ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json(409, { error: { code: "CONFLICT", message: "Doublon" } })),
    );
    await expect(api("/users", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "Doublon",
    });
  });

  it("prévient quand la session expire, sauf sur la connexion elle-même", async () => {
    const fn = vi.fn();
    const off = onUnauthorized(fn);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => json(401, { error: { code: "UNAUTHENTICATED", message: "x" } })),
    );
    await expect(api("/leads")).rejects.toBeInstanceOf(ApiError);
    expect(fn).toHaveBeenCalledTimes(1);
    await expect(api("/auth/login", { method: "POST", body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it("signale un serveur injoignable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));
    await expect(api("/health")).rejects.toMatchObject({ code: "NETWORK" });
  });
});
