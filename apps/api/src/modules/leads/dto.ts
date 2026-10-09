import type { LeadDetail, LeadEvent, LeadSummary, SuppressionReason } from "@gac/shared";
import type { companies, contacts, emailMessages, leads } from "../../db/schema";

type Lead = typeof leads.$inferSelect;
type Company = typeof companies.$inferSelect;
type Contact = typeof contacts.$inferSelect;
type Message = typeof emailMessages.$inferSelect;

export interface JoinedRow {
  lead: Lead;
  company: Company;
  contact: Contact | null;
  message: Message | null;
  /** Motif d'exclusion de l'adresse du contact (liste de suppression), le cas échéant. */
  blockedReason: SuppressionReason | null;
  validatorName: string | null;
}

export function toSummary({ lead, company, contact, message, blockedReason }: JoinedRow): LeadSummary {
  return {
    id: lead.id,
    company: {
      id: company.id,
      name: company.name,
      domain: company.domain,
      website: company.website,
      sector: company.sector,
      employees: company.employees,
      city: company.city,
      region: company.region,
      phone: company.phone,
      googleRating: company.googleRating,
      googleReviews: company.googleReviews,
    },
    contact: contact && {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      jobTitle: contact.jobTitle,
      email: contact.email,
      linkedinUrl: contact.linkedinUrl,
    },
    qualification: lead.qualification,
    service: lead.service,
    source: lead.source,
    stage: lead.stage,
    callStatus: lead.callStatus,
    callState: lead.callState,
    detectedAt: lead.detectedAt.toISOString(),
    email: message && {
      validation: message.validation,
      status: message.status,
      sentOn: message.sentOn,
      subject:
        message.subject && message.subject.length > 120 ? message.subject.slice(0, 120) : message.subject,
      promptVersion: message.promptVersion,
      blockedReason,
      addressCheck: contact?.emailCheck ?? null,
    },
  };
}

export function toDetail(
  row: JoinedRow,
  owner: { id: string; name: string } | null,
  events: LeadEvent[],
): LeadDetail {
  const { lead, company, message } = row;
  return {
    ...toSummary(row),
    qualificationReason: lead.qualificationReason,
    serviceDetail: lead.serviceDetail,
    followup1: lead.followup1,
    followup2: lead.followup2,
    comment: lead.comment,
    nextAction: lead.nextAction,
    dealValue: lead.dealValue,
    pack: lead.pack,
    owner,
    updatedAt: lead.updatedAt.toISOString(),
    companyDetail: {
      address: company.address,
      postalCode: company.postalCode,
      foundedYear: company.foundedYear,
      linkedinUrl: company.linkedinUrl,
      description: company.description,
      googleCategory: company.googleCategory,
      googleMapsUrl: company.googleMapsUrl,
      gps: company.gps,
      organicTraffic: company.organicTraffic,
      domainAuthority: company.domainAuthority,
      backlinks: company.backlinks,
      cms: company.cms,
      isEcommerce: company.isEcommerce,
      hasGtm: company.hasGtm,
      hasGa4: company.hasGa4,
      hasMetaPixel: company.hasMetaPixel,
      hasGoogleAds: company.hasGoogleAds,
      hasSsl: company.hasSsl,
    },
    emailMessage: message && {
      subject: message.subject,
      body: message.body,
      validatedAt: message.validatedAt?.toISOString() ?? null,
      validatedBy: row.validatorName,
      sendError: message.sendError,
      sendReserved: message.sendingAt !== null && message.status === null,
      promptVersion: message.promptVersion,
      updatedAt: message.updatedAt.toISOString(),
    },
    events,
  };
}
