import { z } from "zod";
import { VALIDATION_STATUSES } from "./catalog";
import { leadListQuerySchema } from "./leads";
import type { Role } from "./roles";

/** Rôle minimal pour modifier, valider ou rejeter un e-mail de prospection. */
export const EMAIL_MIN_ROLE: Role = "MANAGER";
export const EMAIL_SUBJECT_MAX = 200;
export const EMAIL_BODY_MAX = 10_000;
/** Au-delà, une validation groupée est refusée : affiner le filtre. */
export const BULK_MAX = 5_000;

export const emailPreviewRequestSchema = z.object({
  subject: z.string().max(EMAIL_SUBJECT_MAX),
  body: z.string().max(EMAIL_BODY_MAX),
});

const previewParagraph = z.object({
  type: z.enum(["text", "agenda", "signature", "footer"]),
  lines: z.array(z.string()),
});

/** Aperçu structuré : l'interface l'affiche sans jamais injecter de HTML ; `html` et `text` sont ceux qui partiront. */
export const emailPreviewSchema = z.object({
  from: z.string(),
  subject: z.string(),
  paragraphs: z.array(previewParagraph),
  html: z.string(),
  text: z.string(),
});
export type EmailPreview = z.infer<typeof emailPreviewSchema>;

export const updateEmailSchema = z
  .object({
    subject: z.string().max(EMAIL_SUBJECT_MAX),
    body: z.string().max(EMAIL_BODY_MAX),
    validation: z.enum(VALIDATION_STATUSES),
    /** Valeur `updatedAt` de l'e-mail relu ; refus (409) si quelqu'un l'a modifié depuis. */
    expectedUpdatedAt: z.iso.datetime(),
  })
  .partial()
  .refine((v) => Object.keys(v).some((k) => k !== "expectedUpdatedAt"), "Au moins un champ à modifier");
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;

/** Filtre d'une validation groupée : les mêmes critères que la liste, sans pagination ni tri. */
export const bulkFilterSchema = leadListQuerySchema
  .omit({
    limit: true,
    offset: true,
    sort: true,
    order: true,
    validation: true,
    emailStatus: true,
    hasEmail: true,
  })
  .partial();
export type BulkFilter = z.infer<typeof bulkFilterSchema>;

export const bulkEmailSchema = z.object({
  /** Seuls « Validé » et « Rejeté » s'appliquent en groupe ; ils ne concernent que les e-mails « Pas Validé » non envoyés. */
  validation: z.enum(["Validé", "Rejeté"]),
  filter: bulkFilterSchema,
  /** Simulation : renvoie les effectifs sans rien modifier. */
  dryRun: z.boolean().default(false),
  /** Effectif vu en simulation ; l'application réelle est refusée (409) s'il a changé. */
  expectedCount: z.number().int().min(0).optional(),
});
export type BulkEmailInput = z.infer<typeof bulkEmailSchema>;

export const bulkEmailResultSchema = z.object({
  dryRun: z.boolean(),
  /** E-mails qui seront (ou ont été) modifiés. */
  eligible: z.number(),
  /** E-mails du filtre qui ne le seront pas, par motif. */
  skipped: z.record(z.string(), z.number()),
});
export type BulkEmailResult = z.infer<typeof bulkEmailResultSchema>;

export const emailStatsSchema = z.object({
  /** À relire et ayant un destinataire. */
  toReview: z.number(),
  /** À relire mais sans adresse : injoignables par e-mail. */
  toReviewNoRecipient: z.number(),
  /** E-mails non envoyés dont l'adresse n'a pas encore été contrôlée. */
  addressUnchecked: z.number(),
  /** E-mails non envoyés dont l'adresse est inutilisable (mal formée, sans serveur, jetable). */
  addressInvalid: z.number(),
  validatedNotSent: z.number(),
  rejected: z.number(),
  sent: z.number(),
  byPrompt: z.array(
    z.object({
      version: z.string(),
      /** Rédigés avec cette version mais pas encore envoyés. */
      pending: z.number(),
      sent: z.number(),
      opened: z.number(),
      bounced: z.number(),
      unsubscribed: z.number(),
    }),
  ),
});
export type EmailStats = z.infer<typeof emailStatsSchema>;

export interface EmailWarning {
  code: string;
  message: string;
}

const JARGON = /\b(backlinks?|autorit[eé] (?:de )?domaine|mots?[- ]cl[eé]s?|seo|pixel|cms)\b/gi;

/**
 * Contrôles de forme d'un e-mail, non bloquants : ils signalent à la personne qui relit ce que la consigne de rédaction
 * interdit ou ce qui ressemble à un oubli. Calculés à la saisie (interface) et à la validation (serveur).
 */
export function emailWarnings({
  subject,
  body,
}: {
  subject: string | null;
  body: string | null;
}): EmailWarning[] {
  const out: EmailWarning[] = [];
  const s = (subject ?? "").trim();
  const b = (body ?? "").trim();
  const text = `${s}\n${b}`;

  const jargon = [...new Set((text.match(JARGON) ?? []).map((m) => m.toLowerCase()))];
  if (jargon.length) {
    out.push({ code: "jargon", message: `Jargon technique à éviter : ${jargon.join(", ")}.` });
  }
  if (/\b0 visiteurs?\b/i.test(text)) {
    out.push({ code: "zero-visitors", message: "Mentionne « 0 visiteur » : la consigne l'interdit." });
  }
  if (/\{\{|\}\}|\[[A-ZÉÈ_ ]{3,}\]|\bXXX\b|\bX visiteurs\b|\bundefined\b|\bTODO\b/.test(text)) {
    out.push({ code: "placeholder", message: "Texte à compléter ou variable non remplacée." });
  }
  if (/https?:\/\/|www\./i.test(b)) {
    out.push({
      code: "link",
      message:
        "Lien dans le texte : le gabarit sobre n'en contient aucun (meilleure arrivée en boîte principale).",
    });
  }
  if (/calendly/i.test(b)) {
    out.push({ code: "agenda", message: "L'agenda est ajouté automatiquement : inutile de le citer." });
  }
  if (b && !/^\s*(bonjour|bonsoir|salut)\b/i.test(b)) {
    out.push({ code: "greeting", message: "Pas de formule d'appel (« Bonjour … ») au début." });
  }
  const words = s ? s.split(/\s+/).length : 0;
  if (s && (words < 3 || words > 12)) {
    out.push({
      code: "subject-length",
      message: `Objet de ${words} mot${words > 1 ? "s" : ""} (5 à 9 recommandés).`,
    });
  }
  if (b && (b.length < 200 || b.length > 2000)) {
    out.push({ code: "body-length", message: `Corps de ${b.length} caractères (200 à 2 000 recommandés).` });
  }
  return out;
}

export const addressCheckRequestSchema = z.object({
  /** Nombre maximal d'adresses contrôlées par appel (le reste se fait à l'appel suivant). */
  limit: z.number().int().min(1).max(500).default(300),
});

export const addressCheckResultSchema = z.object({
  checked: z.number(),
  valid: z.number(),
  invalid: z.record(z.string(), z.number()),
  /** Domaines dont le serveur DNS n'a pas répondu : l'adresse reste à contrôler. */
  indeterminate: z.number(),
  /** E-mails validés qui ont été remis à relire car leur adresse est inutilisable. */
  revoked: z.number(),
  /** Adresses encore à contrôler après cet appel. */
  remaining: z.number(),
});
export type AddressCheckResult = z.infer<typeof addressCheckResultSchema>;

export const sendStatusSchema = z.object({
  mode: z.enum(["off", "prod"]),
  /** Clé Brevo, secrets et expéditeur présents (jamais leur valeur). */
  configured: z.boolean(),
  paused: z.boolean(),
  testRecipient: z.string().nullable(),
  from: z.string(),
  dailyCap: z.number(),
  intervalSeconds: z.number(),
  slots: z.string(),
  windowMinutes: z.number(),
  sentToday: z.number(),
  /** Validés, adresse contrôlée valable, pas exclus : prêts à partir. */
  ready: z.number(),
  /** Validés mais bloqués (adresse non contrôlée ou inutilisable, exclue, trop d'échecs). */
  blocked: z.number(),
  /** Envois dont le résultat est incertain (délai dépassé) : à vérifier chez Brevo puis libérer. */
  uncertain: z.number(),
  slotOpen: z.boolean(),
  nextSlot: z.string().nullable(),
});
export type SendStatus = z.infer<typeof sendStatusSchema>;

export const pauseSchema = z.object({ paused: z.boolean() });
export const testSendSchema = z.object({ leadId: z.uuid() });
export const addSuppressionSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  note: z.string().trim().max(500).optional(),
});
