import { z } from "zod";

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

/** Texte facultatif : variable absente ou vide → valeur par défaut. `\n` littéral accepté pour les sauts de ligne. */
const optionalText = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.replace(/\\n/g, "\n") : fallback));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SLOW_REQUEST_MS: z.coerce.number().int().min(0).default(1000),
  /** Journaux lisibles en développement local (nécessite pino-pretty, absent de l'image de production). */
  LOG_PRETTY: bool.default(false),
  /** Identifiant de la version déployée (SHA Git), exposé par /health. */
  APP_VERSION: z.string().default("dev"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(600),

  DATABASE_URL: z.string().min(1, "DATABASE_URL est obligatoire"),

  /** Origine publique de l'application (ex. https://crm.exemple.fr). Sert au contrôle d'origine des écritures. */
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  /** Derrière Caddy : faire confiance à X-Forwarded-For pour l'adresse IP du client. */
  TRUST_PROXY: bool.optional(),

  SESSION_COOKIE_NAME: z.string().default("gac_session"),
  /** Inactivité maximale avant expiration de la session (glissante). */
  SESSION_IDLE_HOURS: z.coerce.number().positive().default(12),
  /** Durée de vie absolue d'une session, quelle que soit l'activité. */
  SESSION_MAX_DAYS: z.coerce.number().positive().default(14),
  COOKIE_SECURE: bool.optional(),

  LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),

  /** Nombre maximal d'imports (simulation ou réel) par minute et par adresse. */
  IMPORT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  /** Taille maximale d'un fichier importé par l'interface (Mo). */
  IMPORT_MAX_MB: z.coerce.number().positive().max(100).default(10),

  /** Expéditeur, agenda et signature des e-mails (valeurs de l'ancienne chaîne n8n par défaut ; chaîne vide = défaut). */
  MAIL_FROM_NAME: optionalText("Kate de Growthlab Agencycom"),
  MAIL_FROM_ADDRESS: optionalText("kate@growthlab-agencycom.com"),
  MAIL_AGENDA_TEXT: optionalText("calendly.com/kateguttilla-growthlab-agencycom/30min"),
  MAIL_SIGNATURE: optionalText("Kate Guttilla STONE\nTraffic Manager"),

  SWAGGER: bool.default(false),

  /** Premier administrateur, créé au démarrage s'il n'existe pas (jamais modifié ensuite). */
  SEED_ADMIN_EMAIL: z
    .string()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  SEED_ADMIN_PASSWORD: z
    .string()
    .min(12)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type Config = Omit<z.infer<typeof schema>, "TRUST_PROXY" | "COOKIE_SECURE"> & {
  TRUST_PROXY: boolean;
  COOKIE_SECURE: boolean;
  isProduction: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"} : ${i.message}`);
    throw new Error(`Configuration invalide :\n${lines.join("\n")}`);
  }
  const c = parsed.data;
  const isProduction = c.NODE_ENV === "production";
  if (isProduction && c.APP_ORIGIN.startsWith("http://")) {
    throw new Error("Configuration invalide : APP_ORIGIN doit être en https:// en production");
  }
  return {
    ...c,
    isProduction,
    TRUST_PROXY: c.TRUST_PROXY ?? isProduction,
    COOKIE_SECURE: c.COOKIE_SECURE ?? isProduction,
  };
}
