import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authOf } from "../lib/assert";
import { aiUsageToday, rewriteEmail, scoreLead } from "./service";

const scoreResponse = z.object({
  noWebsite: z.boolean(),
  qualification: z.enum(["Chaud", "Tiède", "Froid"]).nullable(),
  service: z.enum(["Google Ads", "Création de site", "Refonte de site"]),
  emailWritten: z.boolean(),
});

/** Qualification et rédaction par IA, à la demande d'un responsable (l'envoi reste toujours validé par une personne). */
export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const manager = app.requireRole("MANAGER");
  const deps = () => ({ db, config, ai: app.aiClient });
  const id = z.object({ id: z.uuid() });

  r.get(
    "/ai/status",
    {
      preHandler: manager,
      schema: {
        response: {
          200: z.object({
            configured: z.boolean(),
            model: z.string(),
            usedToday: z.number(),
            dailyLimit: z.number(),
          }),
        },
      },
    },
    async () => ({
      configured: !!app.aiClient,
      model: config.ANTHROPIC_MODEL,
      usedToday: await aiUsageToday(db),
      dailyLimit: config.AI_DAILY_LIMIT,
    }),
  );

  r.post(
    "/leads/:id/score",
    {
      preHandler: manager,
      schema: { params: id, response: { 200: scoreResponse } },
      config: { rateLimit: { max: config.LOGIN_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } },
    },
    async (req) => {
      const out = await scoreLead(deps(), req.params.id, authOf(req).user.id);
      return out.kind === "no_website"
        ? { noWebsite: true, qualification: null, service: out.service, emailWritten: false }
        : {
            noWebsite: false,
            qualification: out.qualification,
            service: out.service,
            emailWritten: out.emailWritten,
          };
    },
  );

  r.post(
    "/leads/:id/email/rewrite",
    {
      preHandler: manager,
      schema: {
        params: id,
        body: z.object({ instruction: z.string().trim().min(5).max(500) }),
        response: { 200: z.object({ subject: z.string(), body: z.string() }) },
      },
      config: { rateLimit: { max: config.LOGIN_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } },
    },
    async (req) => rewriteEmail(deps(), req.params.id, req.body.instruction, authOf(req).user.id),
  );
}
