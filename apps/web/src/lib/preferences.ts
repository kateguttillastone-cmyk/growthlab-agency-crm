import type { Preferences } from "@gac/shared";
import { api } from "./api";

/** Enregistre une préférence sur le compte. Jamais bloquant : le choix reste appliqué ici même si l'envoi échoue. */
export function savePreferences(patch: Preferences): void {
  api("/auth/preferences", { method: "PUT", body: patch }).catch(() => undefined);
}
