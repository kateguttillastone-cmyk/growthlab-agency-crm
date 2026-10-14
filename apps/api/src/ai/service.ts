import { and, eq, inArray, sql } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db/client";
import { companies, contacts, emailMessages, leadEvents, leads } from "../db/schema";
import type { SiteFetcher } from "../enrich/safe-fetch";
import { enrichCompany } from "../enrich/service";
import { AppError, conflict } from "../lib/errors";
import type { AiClient } from "./anthropic";
import {
  type LeadContext,
  PROMPT_VERSION,
  REWRITE_SYSTEM,
  rewriteUser,
  SCORING_SYSTEM,
  scoringUser,
} from "./prompts";
import { rewriteResultSchema, scoringResultSchema, toolSchema } from "./schemas";

export interface AiDeps {
  db: Db;
  config: Config;
  ai: AiClient | null;
  /** Analyse des sites avant la qualification (absent : pas d'analyse). */
  fetchSite?: SiteFetcher | null;
}

/** Appels à l'IA comptés aujourd'hui (jour de Paris) : qualifications et réécritures, pour le plafond quotidien. */
export async function aiUsageToday(db: Db, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leadEvents)
    .where(
      and(
        inArray(leadEvents.type, ["scored", "email_rewritten"]),
        sql`(${leadEvents.at} at time zone 'Europe/Paris')::date = (${now.toISOString()}::timestamptz at time zone 'Europe/Paris')::date`,
        sql`coalesce(${leadEvents.data}->>'ai', 'false') = 'true'`,
      ),
    );
  return row?.n ?? 0;
}

async function requireBudget(deps: AiDeps): Promise<AiClient> {
  if (!deps.ai) throw conflict("L'IA n'est pas configurée sur ce serveur (clé Anthropic manquante)");
  if ((await aiUsageToday(deps.db)) >= deps.config.AI_DAILY_LIMIT) {
    throw conflict(`Plafond quotidien atteint : ${deps.config.AI_DAILY_LIMIT} appels à l'IA aujourd'hui`);
  }
  return deps.ai;
}

export type ScoreOutcome =
  | { kind: "no_website"; service: "Création de site" }
  | {
      kind: "scored";
      qualification: "Chaud" | "Tiède" | "Froid";
      service: "Google Ads" | "Création de site" | "Refonte de site";
      emailWritten: boolean;
    };

/**
 * Qualifie un lead et rédige son premier e-mail (« Pas Validé » : un humain relit toujours avant l'envoi). Sans site web :
 * service « Création de site », sans appel à l'IA (règle de l'ancienne chaîne). Un e-mail déjà validé, envoyé ou en cours
 * d'envoi n'est jamais écrasé.
 */
export async function scoreLead(deps: AiDeps, leadId: string, actorId: string | null): Promise<ScoreOutcome> {
  const { db } = deps;
  const [row] = await db
    .select({ lead: leads, company: companies, contact: contacts })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .leftJoin(contacts, eq(contacts.id, leads.contactId))
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!row) throw new AppError(404, "NOT_FOUND", "Lead introuvable");

  if (!row.company.website) {
    if (!row.lead.service) {
      await db
        .update(leads)
        .set({ service: "Création de site", updatedAt: new Date() })
        .where(eq(leads.id, leadId));
    }
    await db
      .insert(leadEvents)
      .values({ leadId, actorId, type: "scored", data: { ai: false, reason: "sans site web" } });
    return { kind: "no_website", service: "Création de site" };
  }

  const ai = await requireBudget(deps);
  if (deps.fetchSite && deps.config.ENRICH_SITES) {
    try {
      await enrichCompany(db, deps.fetchSite, row.company.id);
    } catch {
      // l'analyse du site est un plus : sa panne ne bloque jamais la qualification
    }
  }
  const [fresh] = await db.select().from(companies).where(eq(companies.id, row.company.id)).limit(1);
  row.company = fresh ?? row.company;
  const ctx: LeadContext = {
    company: {
      name: row.company.name,
      sector: row.company.sector,
      employees: row.company.employees,
      city: row.company.city,
      website: row.company.website,
      googleRating: row.company.googleRating,
      googleReviews: row.company.googleReviews,
      organicTraffic: row.company.organicTraffic,
      cms: row.company.cms,
      isEcommerce: row.company.isEcommerce,
      hasSsl: row.company.hasSsl,
      hasViewport: row.company.hasViewport,
      siteStatus: row.company.siteStatus,
      hasGoogleAds: row.company.hasGoogleAds,
      hasGa4: row.company.hasGa4,
      hasMetaPixel: row.company.hasMetaPixel,
    },
    contact: row.contact
      ? { firstName: row.contact.firstName, lastName: row.contact.lastName, jobTitle: row.contact.jobTitle }
      : null,
  };
  const raw = await ai.structured({
    system: SCORING_SYSTEM,
    user: scoringUser(ctx),
    toolName: "enregistrer_qualification",
    toolDescription: "Enregistre la qualification du prospect et l'e-mail de prospection rédigé.",
    schema: toolSchema(scoringResultSchema),
  });
  const parsed = scoringResultSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Réponse de l'IA invalide : qualification non enregistrée");
  const r = parsed.data;

  let emailWritten = false;
  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({
        qualification: r.qualification,
        qualificationReason: r.qualificationReason,
        service: r.service,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));
    if (row.contact?.email) {
      const [existing] = await tx
        .select()
        .from(emailMessages)
        .where(and(eq(emailMessages.leadId, leadId), eq(emailMessages.sequenceNo, 1)))
        .limit(1);
      if (!existing) {
        await tx.insert(emailMessages).values({
          leadId,
          subject: r.emailSubject,
          body: r.emailBody,
          promptVersion: PROMPT_VERSION,
        });
        emailWritten = true;
      } else if (existing.validation === "Pas Validé" && !existing.status && !existing.sendingAt) {
        await tx
          .update(emailMessages)
          .set({
            subject: r.emailSubject,
            body: r.emailBody,
            promptVersion: PROMPT_VERSION,
            updatedAt: new Date(),
          })
          .where(eq(emailMessages.id, existing.id));
        emailWritten = true;
      }
    }
    await tx.insert(leadEvents).values({
      leadId,
      actorId,
      type: "scored",
      data: {
        ai: true,
        promptVersion: PROMPT_VERSION,
        qualification: r.qualification,
        service: r.service,
        emailWritten,
      },
    });
  });
  return { kind: "scored", qualification: r.qualification, service: r.service, emailWritten };
}

/** Propose une réécriture de l'e-mail selon une consigne libre. Rien n'est enregistré : la personne relit puis valide. */
export async function rewriteEmail(
  deps: AiDeps,
  leadId: string,
  instruction: string,
  actorId: string | null,
): Promise<{ subject: string; body: string }> {
  const [msg] = await deps.db
    .select()
    .from(emailMessages)
    .where(and(eq(emailMessages.leadId, leadId), eq(emailMessages.sequenceNo, 1)))
    .limit(1);
  if (!msg?.subject || !msg.body) throw new AppError(404, "NOT_FOUND", "Ce lead n'a pas d'e-mail à réécrire");
  const ai = await requireBudget(deps);
  const raw = await ai.structured({
    system: REWRITE_SYSTEM,
    user: rewriteUser(msg.subject, msg.body, instruction),
    toolName: "enregistrer_email",
    toolDescription: "Enregistre l'e-mail réécrit.",
    schema: toolSchema(rewriteResultSchema),
  });
  const parsed = rewriteResultSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Réponse de l'IA invalide : e-mail non modifié");
  await deps.db
    .insert(leadEvents)
    .values({ leadId, actorId, type: "email_rewritten", data: { ai: true, promptVersion: PROMPT_VERSION } });
  return { subject: parsed.data.emailSubject, body: parsed.data.emailBody };
}
