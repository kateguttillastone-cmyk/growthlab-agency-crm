import {
  hasRole,
  LEAD_FIELD_MIN_ROLE,
  nextStageForCallStatus,
  type Role,
  type UpdateLeadInput,
} from "@gac/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { leadEvents, leads, users } from "../../db/schema";
import { conflict, forbidden, notFound } from "../../lib/errors";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Patch = Partial<typeof leads.$inferInsert>;

const SHORT = 200;
const brief = (v: unknown) => (typeof v === "string" && v.length > SHORT ? `${v.slice(0, SHORT)}…` : v);

/**
 * Applique une modification de lead. Les droits se vérifient ici (côté serveur) champ par champ ; chaque
 * changement réel écrit un événement d'historique dans la MÊME transaction.
 */
export async function updateLead(
  db: Db,
  leadId: string,
  input: UpdateLeadInput,
  actor: { id: string; role: Role },
  /** Complète la modification à partir de l'état verrouillé du lead (ex. choix de la case d'un appel). */
  derive?: (current: typeof leads.$inferSelect) => { input: UpdateLeadInput; autoStageReason?: string },
): Promise<void> {
  for (const field of Object.keys(input) as Array<keyof UpdateLeadInput>) {
    if (!hasRole(actor.role, LEAD_FIELD_MIN_ROLE[field])) {
      throw forbidden(`Votre rôle ne permet pas de modifier « ${field} »`);
    }
  }

  await db.transaction(async (tx: Tx) => {
    const [current] = await tx.select().from(leads).where(eq(leads.id, leadId)).for("update").limit(1);
    if (!current) throw notFound("Lead introuvable");

    if (input.ownerId) {
      const [owner] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.ownerId), eq(users.active, true)))
        .limit(1);
      if (!owner) throw conflict("Ce responsable n'existe pas ou son compte est désactivé");
    }

    const derived = derive?.(current);
    const next: UpdateLeadInput = { ...input, ...derived?.input };
    for (const field of Object.keys(next) as Array<keyof UpdateLeadInput>) {
      if (!hasRole(actor.role, LEAD_FIELD_MIN_ROLE[field])) {
        throw forbidden(`Votre rôle ne permet pas de modifier « ${field} »`);
      }
    }
    let autoStage = derived?.autoStageReason !== undefined;
    // Règle métier : un statut d'appel fait avancer l'étape du pipeline, jamais reculer (sauf choix explicite).
    if (input.callStatus !== undefined && input.stage === undefined) {
      const stage = nextStageForCallStatus(current.stage, input.callStatus);
      if (stage !== current.stage) {
        next.stage = stage;
        autoStage = true;
      }
    }

    const patch: Patch = {};
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    for (const [field, to] of Object.entries(next) as Array<[keyof UpdateLeadInput, unknown]>) {
      const from = current[field];
      if (from === to) continue;
      (patch as Record<string, unknown>)[field] = to;
      events.push({
        type: field === "stage" ? "stage_changed" : "field_changed",
        data: {
          field,
          from: brief(from),
          to: brief(to),
          ...(field === "stage" && autoStage
            ? { auto: true, reason: derived?.autoStageReason ?? `statut d'appel « ${input.callStatus} »` }
            : {}),
        },
      });
    }
    if (!events.length) return;

    await tx
      .update(leads)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(leads.id, leadId));
    await tx
      .insert(leadEvents)
      .values(events.map((e) => ({ leadId, actorId: actor.id, type: e.type, data: e.data })));
  });
}
