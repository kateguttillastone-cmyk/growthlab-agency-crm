import { MAIL_SETTING_KEYS, type MailSettingKey, type MailSettings } from "@gac/shared";
import { eq } from "drizzle-orm";
import type { Config } from "../../config";
import type { Db } from "../../db/client";
import { settings } from "../../db/schema";

export const MAIL_OVERRIDES_KEY = "mail_overrides";
export type MailOverrides = Partial<Record<MailSettingKey, string | number>>;

/** Correspondance réglage modifiable -> variable de configuration du serveur. */
const CONFIG_KEY: Record<MailSettingKey, keyof Config> = {
  fromName: "MAIL_FROM_NAME",
  agendaText: "MAIL_AGENDA_TEXT",
  signature: "MAIL_SIGNATURE",
  optOutText: "MAIL_OPTOUT_TEXT",
  dailyCap: "SEND_DAILY_CAP",
  intervalSeconds: "SEND_INTERVAL_SECONDS",
  slots: "SEND_SLOTS",
  windowMinutes: "SEND_WINDOW_MINUTES",
};

export async function readOverrides(db: Db): Promise<MailOverrides> {
  const [row] = await db.select().from(settings).where(eq(settings.key, MAIL_OVERRIDES_KEY)).limit(1);
  const raw = row?.value;
  if (!raw || typeof raw !== "object") return {};
  const out: MailOverrides = {};
  for (const k of MAIL_SETTING_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  return out;
}

export async function writeOverrides(db: Db, overrides: MailOverrides, actorId: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key: MAIL_OVERRIDES_KEY, value: overrides, updatedBy: actorId })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: overrides, updatedAt: new Date(), updatedBy: actorId },
    });
}

/** Configuration du serveur, surchargée par les réglages modifiés dans l'interface. */
export function applyOverrides(config: Config, overrides: MailOverrides): Config {
  const next = { ...config } as Record<string, unknown>;
  for (const k of MAIL_SETTING_KEYS) {
    const v = overrides[k];
    if (v !== undefined) next[CONFIG_KEY[k]] = typeof v === "string" ? v.replace(/\\n/g, "\n") : v;
  }
  return next as unknown as Config;
}

export async function effectiveConfig(db: Db, config: Config): Promise<Config> {
  return applyOverrides(config, await readOverrides(db));
}

export function describeSettings(config: Config, overrides: MailOverrides): MailSettings {
  const effective = applyOverrides(config, overrides);
  const pick = (c: Config) => ({
    fromName: c.MAIL_FROM_NAME,
    agendaText: c.MAIL_AGENDA_TEXT,
    signature: c.MAIL_SIGNATURE,
    optOutText: c.MAIL_OPTOUT_TEXT,
    dailyCap: c.SEND_DAILY_CAP,
    intervalSeconds: c.SEND_INTERVAL_SECONDS,
    slots: c.SEND_SLOTS,
    windowMinutes: c.SEND_WINDOW_MINUTES,
  });
  return {
    values: pick(effective),
    defaults: pick(config),
    overridden: MAIL_SETTING_KEYS.filter((k) => overrides[k] !== undefined),
    serverOnly: {
      fromAddress: config.MAIL_FROM_ADDRESS,
      testRecipient: config.SEND_TEST_RECIPIENT ?? null,
      mode: config.SEND_MODE,
      configured: Boolean(config.BREVO_API_KEY && config.BREVO_WEBHOOK_SECRET && config.UNSUBSCRIBE_SECRET),
    },
  };
}
