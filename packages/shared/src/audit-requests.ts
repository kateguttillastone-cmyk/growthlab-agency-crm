import { z } from "zod";

/** Statuts d'une demande d'audit, dans l'ordre du traitement. */
export const AUDIT_REQUEST_STATUSES = [
  "Nouvelle",
  "Contactée",
  "Audit livré",
  "Convertie",
  "Rejetée",
] as const;
export type AuditRequestStatus = (typeof AUDIT_REQUEST_STATUSES)[number];

/** État de l'accusé de réception : envoyé, en cours, non envoyé (envoi désactivé, adresse exclue) ou refusé. */
export const AUDIT_ACK_STATUSES = ["pending", "sent", "skipped", "failed"] as const;
export type AuditAckStatus = (typeof AUDIT_ACK_STATUSES)[number];

/**
 * Texte de consentement affiché par le formulaire du site, conservé tel quel avec chaque demande (preuve du
 * consentement). À mettre à jour si le texte du site change.
 */
export const AUDIT_CONSENT_TEXT =
  "J'accepte d'être contacté·e par GrowthLab Agencycom au sujet de ma demande.";

const text = (max: number) => z.string().trim().max(max);

/** Corps envoyé par le formulaire du site (public : validé strictement, aucune confiance dans le navigateur). */
export const publicAuditRequestSchema = z.object({
  companyName: text(150).min(2, "Indiquez le nom de l'entreprise"),
  website: text(300).min(3, "Indiquez le site web"),
  email: text(254).pipe(z.email("Adresse e-mail invalide")),
  phone: text(40).optional(),
  subject: text(200).optional(),
  message: text(4000).optional(),
  /** Case de consentement : obligatoire. */
  consent: z.literal(true, { error: "Le consentement est obligatoire" }),
  /** Champ piège invisible : un robot le remplit, une personne jamais. */
  hp: z.string().max(200).optional(),
});
export type PublicAuditRequestInput = z.infer<typeof publicAuditRequestSchema>;

export const auditRequestSchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  companyName: z.string(),
  website: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  subject: z.string().nullable(),
  message: z.string().nullable(),
  status: z.enum(AUDIT_REQUEST_STATUSES),
  note: z.string().nullable(),
  ownerId: z.uuid().nullable(),
  ackStatus: z.enum(AUDIT_ACK_STATUSES),
  ackSentAt: z.string().nullable(),
  ackError: z.string().nullable(),
  leadId: z.uuid().nullable(),
  /** Adresse déjà connue comme exclue (désinscription, rebond…) : aucun e-mail ne lui est envoyé. */
  suppressed: z.boolean(),
  /** Un lead de prospection existe déjà pour cette adresse ou ce site. */
  knownLeadId: z.uuid().nullable(),
});
export type AuditRequest = z.infer<typeof auditRequestSchema>;

export const auditRequestListQuerySchema = z.object({
  status: z.enum(AUDIT_REQUEST_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AuditRequestListQuery = z.infer<typeof auditRequestListQuerySchema>;

export const auditRequestPageSchema = z.object({
  items: z.array(auditRequestSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  /** Nombre de demandes par statut (onglets). */
  byStatus: z.record(z.string(), z.number()),
});
export type AuditRequestPage = z.infer<typeof auditRequestPageSchema>;

export const auditRequestUpdateSchema = z
  .object({
    status: z.enum(AUDIT_REQUEST_STATUSES).optional(),
    note: text(2000).nullable().optional(),
    ownerId: z.uuid().nullable().optional(),
  })
  .refine(
    (v) => v.status !== undefined || v.note !== undefined || v.ownerId !== undefined,
    "Rien à modifier",
  );
export type AuditRequestUpdate = z.infer<typeof auditRequestUpdateSchema>;

export const auditRequestConvertResultSchema = z.object({
  leadId: z.uuid(),
  /** Le prospect existait déjà : la demande y est rattachée sans créer de doublon. */
  existing: z.boolean(),
  request: auditRequestSchema,
});
export type AuditRequestConvertResult = z.infer<typeof auditRequestConvertResultSchema>;

/** Rôle minimal pour voir et traiter les demandes d'audit (elles contiennent des données personnelles). */
export const AUDIT_REQUEST_ROLE = "AGENT" as const;
