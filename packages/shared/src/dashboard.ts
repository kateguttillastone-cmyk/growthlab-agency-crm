import { z } from "zod";
import { PIPELINE_STAGES } from "./catalog";
import { leadSummarySchema } from "./leads";

export const DASHBOARD_PERIODS = ["all", "7", "30", "90", "custom"] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");

/** Période choisie, appliquée à la date de détection des leads (un lead sans date est exclu d'une période bornée). */
export const dashboardQuerySchema = z
  .object({
    period: z.enum(DASHBOARD_PERIODS).default("all"),
    from: day.optional(),
    to: day.optional(),
  })
  .refine((q) => q.period !== "custom" || (q.from && q.to && q.from <= q.to), {
    message: "Période personnalisée : deux dates, la première avant la seconde",
  });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const dashboardSchema = z.object({
  kpis: z.object({
    leads: z.number(),
    qualified: z.number(),
    emailsValidated: z.number(),
    emailsSent: z.number(),
    toCall: z.number(),
    appointments: z.number(),
    won: z.number(),
    wonValue: z.number(),
    activePipeline: z.number(),
    pipelineValue: z.number(),
    openDeals: z.number(),
  }),
  qualification: z.record(z.string(), z.number()),
  sectors: z.array(z.object({ label: z.string(), count: z.number() })),
  pipeline: z.array(z.object({ stage: z.enum(PIPELINE_STAGES), count: z.number(), value: z.number() })),
  /** Leads chauds dont l'e-mail n'est pas encore validé (6 au plus). */
  priority: z.array(leadSummarySchema),
  /** Les 8 derniers leads détectés. */
  recent: z.array(leadSummarySchema),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
