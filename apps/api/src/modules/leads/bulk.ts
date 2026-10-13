import {
  BULK_LEADS_MAX,
  bulkLeadsResultSchema,
  bulkLeadsSchema,
  createLeadSchema,
  hasRole,
  LEAD_FIELD_MIN_ROLE,
  leadDetailSchema,
  type UpdateLeadInput,
} from "@gac/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { companies, contacts, emailMessages, leadEvents, leads, users } from "../../db/schema";
import { authOf } from "../../lib/assert";
import { audit } from "../../lib/audit";
import { createLead } from "../../lib/create-lead";
import { AppError, conflict, forbidden } from "../../lib/errors";
import { leadFilters } from "./queries";
import { leadReader } from "./read";

type BulkKey = keyof NonNullable<ReturnType<typeof bulkLeadsSchema.parse>["set"]>;
const CHUNK = 2000;

/** Actions groupées sur les leads et création manuelle d'un lead. */
export async function leadsBulkRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const agent = app.requireRole("AGENT");
  const { detail } = leadReader(db);

  /**
   * Modifie la même chose sur plusieurs leads : lignes choisies (`ids`) ou filtre. Simulation d'abord (`dryRun`), puis
   * application avec l'effectif simulé. Droits champ par champ comme `PATCH /leads/:id` ; un historique par lead modifié.
   */
  r.post(
    "/leads/bulk",
    { preHandler: agent, schema: { body: bulkLeadsSchema, response: { 200: bulkLeadsResultSchema } } },
    async (req) => {
      const { ids, filter, set, dryRun, expectedCount } = req.body;
      const actor = authOf(req).user;
      const keys = Object.keys(set) as BulkKey[];
      for (const k of keys) {
        if (!hasRole(actor.role, LEAD_FIELD_MIN_ROLE[k as keyof UpdateLeadInput])) {
          throw forbidden(`Votre rôle ne permet pas de modifier « ${k} »`);
        }
      }
      if (!dryRun && expectedCount === undefined) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Lancez d'abord une simulation (effectif attendu manquant)",
        );
      }
      if (set.ownerId) {
        const [owner] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, set.ownerId), eq(users.active, true)))
          .limit(1);
        if (!owner) throw conflict("Ce responsable n'existe pas ou son compte est désactivé");
      }

      const result = await db.transaction(async (tx) => {
        const target = ids ? inArray(leads.id, ids) : leadFilters(filter ?? {});
        const rows = await tx
          .select({
            id: leads.id,
            qualification: leads.qualification,
            service: leads.service,
            stage: leads.stage,
            callState: leads.callState,
            ownerId: leads.ownerId,
          })
          .from(leads)
          .innerJoin(companies, eq(companies.id, leads.companyId))
          .leftJoin(contacts, eq(contacts.id, leads.contactId))
          .leftJoin(
            emailMessages,
            sql`${emailMessages.leadId} = ${leads.id} and ${emailMessages.sequenceNo} = 1`,
          )
          .where(target)
          .for("update", { of: leads });
        if (rows.length > BULK_LEADS_MAX) throw conflict("Trop de leads d'un coup : affinez le filtre");

        const changes = rows
          .map((row) => ({ row, diff: keys.filter((k) => row[k] !== (set[k] ?? null)) }))
          .filter((c) => c.diff.length > 0);
        const outcome = (changed: number, applied: boolean) => ({
          dryRun: !applied,
          matched: rows.length,
          changed,
          unchanged: rows.length - changed,
        });
        if (dryRun) return outcome(changes.length, false);
        if (changes.length !== expectedCount) {
          throw conflict(
            `Le nombre de leads concernés a changé (${changes.length} au lieu de ${expectedCount}) : relancez la simulation`,
          );
        }
        if (changes.length) {
          await tx
            .update(leads)
            .set({ ...set, updatedAt: new Date() })
            .where(
              inArray(
                leads.id,
                changes.map((c) => c.row.id),
              ),
            );
          const events = changes.flatMap(({ row, diff }) =>
            diff.map((k) => ({
              leadId: row.id,
              actorId: actor.id,
              type: k === "stage" ? "stage_changed" : "field_changed",
              data: { field: k, from: row[k], to: set[k] ?? null, bulk: true },
            })),
          );
          for (let i = 0; i < events.length; i += CHUNK) {
            await tx.insert(leadEvents).values(events.slice(i, i + CHUNK));
          }
        }
        return outcome(changes.length, true);
      });
      if (!result.dryRun && result.changed > 0) {
        await audit(db, {
          actorId: actor.id,
          action: "leads.bulk_update",
          entityType: "lead",
          data: { set, changed: result.changed, mode: ids ? "ids" : "filter" },
          ip: req.ip,
        });
      }
      return result;
    },
  );

  /**
   * Crée un lead à la main. Mêmes clés de déduplication que l'import (domaine, sinon nom + téléphone ; e-mail du
   * contact) : un prospect déjà connu n'est jamais dupliqué, la réponse indique le lead existant.
   */
  r.post(
    "/leads",
    {
      preHandler: agent,
      schema: { body: createLeadSchema, response: { 201: leadDetailSchema } },
    },
    async (req, reply) => {
      const b = req.body;
      const actor = authOf(req).user;
      if ((b.qualification || b.service) && !hasRole(actor.role, "MANAGER")) {
        throw forbidden("La qualification et le service sont réservés aux responsables");
      }
      const leadId = await createLead(db, b, {
        actorId: actor.id,
        source: "Saisie manuelle",
        eventData: { manual: true },
      });
      return reply.code(201).send(await detail(leadId));
    },
  );
}
