import { z } from "zod";

/** Au-delà, l'import par l'interface est refusé (la requête durerait trop longtemps) : utiliser la commande en ligne. */
export const MAX_IMPORT_ROWS = 20_000;

const created = z.object({ created: z.number(), existing: z.number() });

/** Rapport d'import : uniquement des effectifs et des types d'anomalies, jamais de donnée de prospect. */
export const importReportSchema = z.object({
  dryRun: z.boolean(),
  rows: z.number(),
  skipped: z.number(),
  companies: created,
  contacts: created,
  leads: created,
  emailMessages: created,
  suppressions: created,
  warnings: z.record(z.string(), z.number()),
});
export type ImportReport = z.infer<typeof importReportSchema>;

export const importResultSchema = z.object({
  report: importReportSchema,
  /** `true` quand les données ont réellement été écrites ; `false` pour une simulation. */
  applied: z.boolean(),
  file: z.object({
    name: z.string(),
    bytes: z.number(),
    /** Empreinte SHA-256 : l'import réel exige celle de la simulation, donc le même fichier. */
    sha256: z.string(),
  }),
});
export type ImportResult = z.infer<typeof importResultSchema>;
