import type { FastifyInstance } from "fastify";
import { sendTick } from "./service";

const TICK_MS = 15_000;

/** Lance la boucle d'envoi (si SEND_MODE=prod). Jamais appelée par les tests : ils appellent `sendTick` directement. */
export function startSendScheduler(app: FastifyInstance): () => void {
  if (app.config.SEND_MODE !== "prod") {
    app.log.info("Envoi automatique désactivé (SEND_MODE=off)");
    return () => {};
  }
  app.log.warn(
    `Envoi automatique ACTIVÉ : créneaux ${app.config.SEND_SLOTS}, plafond ${app.config.SEND_DAILY_CAP}/jour`,
  );
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const outcome = await sendTick({ db: app.db, config: app.config, sender: app.mailSender });
      // jamais d'adresse dans les journaux : seulement l'identifiant du lead
      if (outcome.kind !== "idle") app.log.info({ outcome }, "envoi");
    } catch (err) {
      app.log.error({ err }, "erreur du cycle d'envoi");
    } finally {
      running = false;
    }
  }, TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}
