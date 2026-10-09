import { z } from "zod";

/** Rôles, du plus au moins privilégié. ADMIN > MANAGER > AGENT > VIEWER. */
export const ROLES = ["ADMIN", "MANAGER", "AGENT", "VIEWER"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

const RANK: Record<Role, number> = { ADMIN: 3, MANAGER: 2, AGENT: 1, VIEWER: 0 };

/** Vrai si `role` est au moins égal à `minimum` dans la hiérarchie. */
export function hasRole(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrateur",
  MANAGER: "Responsable",
  AGENT: "Commercial",
  VIEWER: "Lecture seule",
};
