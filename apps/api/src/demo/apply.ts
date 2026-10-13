import { PIPELINE_STAGES } from "@gac/shared";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  companies,
  contacts,
  emailMessages,
  leadEvents,
  leads,
  savedViews,
  suppressions,
  users,
} from "../db/schema";
import { nameKey } from "../import/normalize";
import type { Demo } from "./data";

const DAY = 86_400_000;

function mailText(
  company: string,
  sector: string,
  city: string,
  first: string,
): { subject: string; body: string } {
  return {
    subject: `${company} : plus de demandes par Google, sans y passer vos soirées`,
    body: [
      `Bonjour ${first},`,
      `Je suis tombé sur ${company} en cherchant un(e) ${sector.toLowerCase()} à ${city} : vos avis sont excellents, mais votre présence en ligne ne le montre pas encore autant qu'elle le pourrait.`,
      "Chez GrowthLab Agency, nous aidons les artisans et commerces locaux à recevoir plus de demandes qualifiées, avec un budget maîtrisé et un suivi mensuel simple.",
      "Seriez-vous disponible 15 minutes cette semaine pour en parler ?",
      "Bien cordialement,",
    ].join("\n\n"),
  };
}

/** Écrit les données de démonstration. `reset` vide d'abord la base métier (leads, entreprises, contacts, exclusions). */
export async function applyDemo(db: Db, demo: Demo, opts: { reset: boolean }): Promise<string> {
  const existing = await db.select({ id: leads.id }).from(leads).limit(1);
  if (existing.length > 0 && !opts.reset) {
    throw new Error(
      "La base contient déjà des leads : relancez avec --reset --confirm-reset pour la vider d'abord.",
    );
  }
  const owners = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.createdAt));
  const now = Date.now();

  return db.transaction(async (tx) => {
    if (opts.reset) {
      await tx.delete(leadEvents);
      await tx.delete(emailMessages);
      await tx.delete(leads);
      await tx.delete(contacts);
      await tx.delete(companies);
      await tx.delete(suppressions);
      await tx.delete(savedViews);
    }
    let mails = 0;
    let excluded = 0;
    for (const d of demo.leads) {
      const detectedAt = new Date(now - d.daysAgo * DAY);
      const domain = d.withSite ? `${d.slug}.example` : null;
      const [company] = await tx
        .insert(companies)
        .values({
          name: d.company,
          nameKey: nameKey(d.company),
          domain,
          website: domain ? `https://www.${domain}` : null,
          sector: d.sector,
          employees: d.employees,
          city: d.city,
          postalCode: d.postalCode,
          region: "Auvergne-Rhône-Alpes",
          phone: d.phone,
          googleCategory: d.sector,
          googleRating: d.rating,
          googleReviews: d.reviews,
          googleMapsUrl: `https://maps.google.com/?q=${encodeURIComponent(d.company)}`,
          hasSsl: d.withSite ? true : null,
          createdAt: detectedAt,
        })
        .returning({ id: companies.id });
      if (!company) throw new Error("Insertion entreprise impossible");

      let contactId: string | null = null;
      if (d.contact) {
        const [c] = await tx
          .insert(contacts)
          .values({
            companyId: company.id,
            firstName: d.contact.first,
            lastName: d.contact.last,
            nameKey: nameKey(`${d.contact.first} ${d.contact.last}`),
            jobTitle: d.contact.job,
            email: d.email_addr,
            emailCheck: d.email?.check ?? (d.email ? "valid" : null),
            emailCheckedAt: d.email ? new Date(now - DAY) : null,
            createdAt: detectedAt,
          })
          .returning({ id: contacts.id });
        contactId = c?.id ?? null;
      }

      const [lead] = await tx
        .insert(leads)
        .values({
          companyId: company.id,
          contactId,
          ownerId:
            d.owner === null || owners.length === 0 ? null : (owners[d.owner % owners.length]?.id ?? null),
          source: d.withSite ? "Démo · LinkedIn" : "Démo · Google Maps",
          detectedAt,
          qualification: d.qualification,
          service: d.service,
          stage: d.stage,
          dealValue: d.dealValue,
          callStatus: d.callStatus,
          followup1: d.followup1,
          callState: d.callState,
          comment: d.comment,
          createdAt: detectedAt,
          updatedAt: new Date(now - Math.max(0, d.daysAgo - 1) * DAY),
        })
        .returning({ id: leads.id });
      if (!lead) throw new Error("Insertion lead impossible");

      // Historique : création puis une ligne par étape franchie (alimente les délais du tableau de bord).
      await tx
        .insert(leadEvents)
        .values({ leadId: lead.id, type: "created", data: { demo: true }, at: detectedAt });
      const k = d.stage ? PIPELINE_STAGES.indexOf(d.stage) : -1;
      const path =
        d.stage === "Perdu" ? [0, 1, PIPELINE_STAGES.length - 1] : Array.from({ length: k + 1 }, (_, i) => i);
      for (let i = 1; i < path.length; i++) {
        const step = ((d.daysAgo - 1) / path.length) * i;
        await tx.insert(leadEvents).values({
          leadId: lead.id,
          type: "stage_changed",
          data: {
            field: "stage",
            from: PIPELINE_STAGES[path[i - 1] as number],
            to: PIPELINE_STAGES[path[i] as number],
          },
          at: new Date(detectedAt.getTime() + step * DAY),
        });
      }

      if (d.email && d.contact) {
        const text = mailText(d.company, d.sector, d.city, d.contact.first);
        const sent = d.email.status !== null;
        const sentAt = sent ? new Date(now - Math.max(1, d.daysAgo - 3) * DAY) : null;
        await tx.insert(emailMessages).values({
          leadId: lead.id,
          subject: text.subject,
          body: text.body,
          validation: d.email.validation,
          validatedAt: d.email.validation === "Pas Validé" ? null : new Date(now - 2 * DAY),
          validatedBy: d.email.validation === "Pas Validé" ? null : (owners[0]?.id ?? null),
          status: d.email.status,
          sentAt,
          sentOn: sentAt ? sentAt.toISOString().slice(0, 10) : null,
          promptVersion: d.email.prompt,
          ...(d.email.uncertain
            ? { sendingAt: new Date(now - 3 * 3_600_000), sendError: "délai dépassé (résultat inconnu)" }
            : {}),
        });
        mails++;
      }
      if (d.suppressed && d.email_addr) {
        await tx
          .insert(suppressions)
          .values({
            email: d.email_addr,
            reason: d.suppressed,
            note: d.suppressed === "manual" ? "Demande orale (démo)" : null,
          })
          .onConflictDoNothing();
        excluded++;
      }
    }
    return `Démo prête : ${demo.leads.length} leads, ${mails} e-mails, ${excluded} adresses exclues${opts.reset ? " (base métier vidée avant)" : ""}.`;
  });
}
