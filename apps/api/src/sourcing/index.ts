import type { Config } from "../config";
import { apifyProvider } from "./apify";
import type { SourcingProvider } from "./provider";

/** Fournisseur du mode configuré ; null quand le sourcing est désactivé (la configuration exige alors le jeton). */
export function createSourcingProvider(config: Config): SourcingProvider | null {
  if (config.SOURCING_MODE !== "apify" || !config.APIFY_TOKEN) return null;
  return apifyProvider({
    token: config.APIFY_TOKEN,
    actorMaps: config.APIFY_ACTOR_MAPS,
    actorLeads: config.APIFY_ACTOR_LEADS,
    usdToEur: config.SOURCING_USD_TO_EUR,
  });
}
