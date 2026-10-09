import { describe, expect, it } from "vitest";
import { waitForDatabase } from "../src/db/wait";

const url = process.env.DATABASE_URL ?? "postgresql://gac:gac@localhost:5432/gac_test";

describe("waitForDatabase", () => {
  it("rend la main tout de suite quand la base répond", async () => {
    const t0 = Date.now();
    await waitForDatabase(url, { timeoutMs: 5_000 });
    expect(Date.now() - t0).toBeLessThan(3_000);
  });

  it("réessaie quand le serveur n'écoute pas, puis abandonne avec un message clair", async () => {
    const logs: string[] = [];
    const t0 = Date.now();
    await expect(
      waitForDatabase("postgresql://gac:gac@127.0.0.1:1/gac", {
        timeoutMs: 700,
        intervalMs: 100,
        log: (m) => logs.push(m),
      }),
    ).rejects.toThrow(/injoignable.*ECONNREFUSED.*n'accepte pas les connexions/s);
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(500);
  });

  it("explique un nom d'hôte introuvable (service absent du réseau Docker)", async () => {
    await expect(
      waitForDatabase("postgresql://gac:gac@postgres-absent.invalid:5432/gac", {
        timeoutMs: 400,
        intervalMs: 100,
      }),
    ).rejects.toThrow(/postgres-absent\.invalid.*même réseau Docker/s);
  });

  it("échoue immédiatement quand l'attente ne servirait à rien (base inexistante)", async () => {
    const u = new URL(url);
    u.pathname = "/gac_base_qui_n_existe_pas";
    const t0 = Date.now();
    await expect(
      waitForDatabase(u.toString(), { timeoutMs: 30_000, intervalMs: 5_000 }),
    ).rejects.toMatchObject({
      code: "3D000",
    });
    expect(Date.now() - t0).toBeLessThan(3_000);
  });
});
