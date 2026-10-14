import { z } from "zod";

export const scoringResultSchema = z.object({
  segment: z.enum(["E-commerçant", "PME/TPE"]),
  qualification: z.enum(["Chaud", "Tiède", "Froid"]),
  qualificationReason: z.string().min(5).max(400),
  service: z.enum(["Google Ads", "Création de site", "Refonte de site"]),
  emailSubject: z.string().min(10).max(120),
  emailBody: z.string().min(60).max(1800),
});
export type ScoringResult = z.infer<typeof scoringResultSchema>;

export const rewriteResultSchema = z.object({
  emailSubject: z.string().min(10).max(120),
  emailBody: z.string().min(60).max(1800),
});
export type RewriteResult = z.infer<typeof rewriteResultSchema>;

/** Schéma JSON d'un outil Anthropic, tiré du même schéma Zod que la validation (une seule définition). */
export function toolSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}
