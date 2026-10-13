import type { SourcingCriteria } from "@gac/shared";

/** Un prospect trouvé, normalisé par le fournisseur. Aucune donnée n'est conservée telle quelle : tout passe par `createLead`. */
export interface FoundProspect {
  companyName: string;
  website?: string | null;
  phone?: string | null;
  city?: string | null;
  postalCode?: string | null;
  address?: string | null;
  sector?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  employees?: number | null;
  googleCategory?: string | null;
  googleRating?: number | null;
  googleReviews?: number | null;
  googleMapsUrl?: string | null;
  linkedinUrl?: string | null;
}

export type PollResult =
  | { state: "running"; progress?: number }
  | { state: "succeeded"; items: FoundProspect[]; cost?: number }
  | { state: "failed"; error: string };

/** Fournisseur de prospects (Apify en production, faux fournisseur en test). Aucun secret n'est jamais renvoyé ni journalisé. */
export interface SourcingProvider {
  start(criteria: SourcingCriteria): Promise<{ providerRunId: string }>;
  poll(providerRunId: string): Promise<PollResult>;
  abort(providerRunId: string): Promise<void>;
}
