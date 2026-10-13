import type { Config } from "../config";
import type { SourcingProvider } from "./provider";

/** Fournisseur du mode configuré ; null quand le sourcing est désactivé. */
export function createSourcingProvider(config: Config): SourcingProvider | null {
  if (config.SOURCING_MODE === "off") return null;
  return null; // le fournisseur Apify arrive au lot suivant
}
