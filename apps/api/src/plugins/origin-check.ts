import type { FastifyInstance } from "fastify";
import { forbidden } from "../lib/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Protection CSRF de seconde ligne (en plus de SameSite=Lax) : une requête qui modifie des données
 * doit venir de l'origine de l'application. Les clients sans en-tête Origin (curl, tests) ne portent
 * pas de cookie de navigateur, ils ne sont donc pas concernés.
 */
export function registerOriginCheck(app: FastifyInstance): void {
  const allowed = new URL(app.config.APP_ORIGIN).origin;
  app.addHook("onRequest", async (req) => {
    if (SAFE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (origin && origin !== allowed) throw forbidden("Origine non autorisée");
    if (req.headers["sec-fetch-site"] === "cross-site") throw forbidden("Requête inter-sites refusée");
  });
}
