import { MAIL_SETTING_KEYS, mailSettingsSchema, mailSettingsUpdateSchema } from "@gac/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authOf } from "../../lib/assert";
import { audit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { parseSlots } from "../../mail/slots";
import { describeSettings, type MailOverrides, readOverrides, writeOverrides } from "./effective";

/** Réglages de l'e-mail et de l'envoi modifiables sans toucher au serveur. Sécurité, clés et mode restent côté serveur. */
export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/settings/mail",
    { preHandler: app.requireRole("MANAGER"), schema: { response: { 200: mailSettingsSchema } } },
    async () => describeSettings(config, await readOverrides(db)),
  );

  r.put(
    "/settings/mail",
    {
      preHandler: app.requireRole("ADMIN"),
      schema: { body: mailSettingsUpdateSchema, response: { 200: mailSettingsSchema } },
    },
    async (req) => {
      const actor = authOf(req).user;
      const next: MailOverrides = { ...(await readOverrides(db)) };
      const changed: string[] = [];
      for (const key of MAIL_SETTING_KEYS) {
        const v = req.body[key];
        if (v === undefined) continue;
        changed.push(key);
        if (v === null) delete next[key];
        else next[key] = v;
      }
      if (typeof next.slots === "string") {
        try {
          parseSlots(next.slots);
        } catch (e) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            (e as Error).message.replace("Configuration invalide : ", ""),
          );
        }
      }
      await writeOverrides(db, next, actor.id);
      await audit(db, {
        actorId: actor.id,
        action: "settings.mail_updated",
        entityType: "settings",
        data: { changed },
        ip: req.ip,
      });
      return describeSettings(config, next);
    },
  );
}
