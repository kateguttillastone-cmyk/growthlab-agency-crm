import type { ApiErrorBody } from "@gac/shared";
import type { FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import { AppError } from "../lib/errors";

/** Format d'erreur unique : `{ error: { code, message, details? } }`. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => {
    const body: ApiErrorBody = { error: { code: "NOT_FOUND", message: "Route introuvable" } };
    return reply.status(404).send(body);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      const body: ApiErrorBody = {
        error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      };
      return reply.status(err.statusCode).send(body);
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const body: ApiErrorBody = {
        error: {
          code: "VALIDATION_ERROR",
          message: "Données invalides",
          details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
        },
      };
      return reply.status(400).send(body);
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode === 429) {
      const body: ApiErrorBody = {
        error: { code: "RATE_LIMITED", message: "Trop de requêtes, réessayez dans un instant" },
      };
      return reply.status(429).send(body);
    }
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500 && !isResponseSerializationError(err)) {
      const body: ApiErrorBody = {
        error: { code: "VALIDATION_ERROR", message: e.message ?? "Requête invalide" },
      };
      return reply.status(e.statusCode).send(body);
    }
    req.log.error({ err }, "erreur non gérée");
    const body: ApiErrorBody = { error: { code: "INTERNAL_ERROR", message: "Erreur interne" } };
    return reply.status(500).send(body);
  });
}
