import type { Db } from "../db/client";
import { auditEvents } from "../db/schema";

export interface AuditInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  data?: Record<string, unknown>;
  ip?: string | null;
}

/** Ajoute une ligne au journal d'audit. Ne doit jamais contenir de secret (mot de passe, jeton). */
export async function audit(db: Db, e: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    actorId: e.actorId ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    data: e.data ?? null,
    ip: e.ip ?? null,
  });
}
