import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  /** 200 si l'API ET la base répondent ; 503 sinon (sonde de déploiement et de supervision). */
  app.get("/health", { logLevel: "warn" }, async (_req, reply) => {
    try {
      await app.db.execute(sql`select 1`);
      return { status: "ok", db: true, version: app.config.APP_VERSION };
    } catch {
      return reply.status(503).send({ status: "degraded", db: false, version: app.config.APP_VERSION });
    }
  });
}
