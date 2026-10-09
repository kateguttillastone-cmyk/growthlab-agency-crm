import type { EmailStatus, SuppressionReason } from "@gac/shared";

export interface MappedEvent {
  status?: EmailStatus;
  suppress?: SuppressionReason;
}

/** Évènement Brevo → statut de l'e-mail et exclusion éventuelle. Les évènements sans effet renvoient `null`. */
export function mapBrevoEvent(event: string): MappedEvent | null {
  switch (event.toLowerCase()) {
    case "delivered":
      return { status: "Délivré" };
    case "opened":
    case "unique_opened":
    case "proxy_open":
    case "unique_proxy_open":
    case "click":
      return { status: "Ouvert" };
    case "hard_bounce":
    case "invalid_email":
    case "blocked":
      return { status: "Bounce", suppress: "bounce" };
    case "spam":
    case "complaint":
      return { status: "Désinscrit", suppress: "complaint" };
    case "unsubscribed":
    case "unsubscription":
      return { status: "Désinscrit", suppress: "unsubscribe" };
    default:
      return null; // request, deferred, soft_bounce, error… : on attend l'évènement définitif
  }
}

/** Un statut ne recule jamais : Envoyé < Délivré < Ouvert < (Bounce, Désinscrit : définitifs). */
const RANK: Record<EmailStatus, number> = { Envoyé: 0, Délivré: 1, Ouvert: 2, Bounce: 3, Désinscrit: 3 };
export const advances = (from: EmailStatus | null, to: EmailStatus): boolean =>
  from === null || RANK[to] > RANK[from];
