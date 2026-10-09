import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Config } from "./config";
import type { Db } from "./db/client";
import { auditRoutes } from "./modules/audit/routes";
import { authRoutes } from "./modules/auth/routes";
import { emailsRoutes } from "./modules/emails/routes";
import { healthRoutes } from "./modules/health/routes";
import { importsRoutes } from "./modules/imports/routes";
import { leadsRoutes } from "./modules/leads/routes";
import { usersRoutes } from "./modules/users/routes";
import { registerAuth } from "./plugins/auth";
import { registerErrorHandling } from "./plugins/errors";
import { registerOriginCheck } from "./plugins/origin-check";

export interface AppDeps {
  config: Config;
  db: Db;
}

export async function buildApp({ config, db }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL,
      redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
      ...(config.LOG_PRETTY
        ? {
            transport: {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
            },
          }
        : {}),
    },
    genReqId: (req) =>
      typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : randomUUID(),
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("config", config);
  app.decorate("db", db);

  registerErrorHandling(app);

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
    reply.header("cache-control", "no-store");
  });
  app.addHook("onResponse", async (req, reply) => {
    const ms = reply.elapsedTime;
    if (config.SLOW_REQUEST_MS > 0 && ms > config.SLOW_REQUEST_MS) {
      req.log.warn({ ms: Math.round(ms), url: req.url, method: req.method }, "requête lente");
    }
  });

  await app.register(helmet, { global: true });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_PER_MINUTE,
    timeWindow: "1 minute",
    allowList: (req) => req.url === "/health",
  });

  if (config.SWAGGER) {
    await app.register(swagger, {
      openapi: { info: { title: "GAC Pilot — API", version: config.APP_VERSION } },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: "/docs", staticCSP: true });
  }

  registerOriginCheck(app);
  registerAuth(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(auditRoutes);
  await app.register(leadsRoutes);
  await app.register(emailsRoutes);
  await app.register(importsRoutes);

  return app;
}
