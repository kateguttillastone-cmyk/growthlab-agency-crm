import type { FastifyInstance } from "fastify";
import { sourcingTick } from "./service";

const TICK_MS = 10_000;

/** Boucle du sourcing (si un fournisseur est configuré). Les tests appellent `sourcingTick` directement. */
export function startSourcingScheduler(app: FastifyInstance): () => void {
  if (!app.sourcingProvider) {
    app.log.info("Sourcing désactivé (SOURCING_MODE=off)");
    return () => {};
  }
  app.log.warn(
    `Sourcing ACTIVÉ : plafond ${app.config.SOURCING_DAILY_BUDGET} €/jour, ${app.config.SOURCING_MAX_PER_RUN} résultats max par recherche`,
  );
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await sourcingTick({
        db: app.db,
        config: app.config,
        provider: app.sourcingProvider,
        ai: app.aiClient,
      });
    } catch (err) {
      app.log.error({ err }, "erreur du cycle de sourcing");
    } finally {
      running = false;
    }
  }, TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}
