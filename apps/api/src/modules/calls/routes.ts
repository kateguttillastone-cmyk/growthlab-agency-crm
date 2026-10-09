import { type CallSnapshot, leadDetailSchema, logCallSchema, planCall } from "@gac/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authOf } from "../../lib/assert";
import { leadReader } from "../leads/read";
import { updateLead } from "../leads/update";

const idParams = z.object({ id: z.uuid() });

const today = () => new Date().toLocaleDateString("fr-FR");

export async function callsRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { detail } = leadReader(db);

  /**
   * Enregistre l'issue d'un appel en une seule requête : résultat dans la première case libre (appel, relance 1,
   * relance 2), file d'appel et étape du pipeline mises à jour, note ajoutée au commentaire. Tout est décidé sur
   * l'état verrouillé du lead : deux personnes qui appellent en même temps ne s'écrasent pas.
   */
  r.post(
    "/leads/:id/call",
    {
      preHandler: app.requireRole("AGENT"),
      schema: { params: idParams, body: logCallSchema, response: { 200: leadDetailSchema } },
    },
    async (req) => {
      const { outcome, note } = req.body;
      await updateLead(db, req.params.id, {}, authOf(req).user, (current) => {
        const snapshot: CallSnapshot = {
          stage: current.stage,
          callStatus: current.callStatus,
          followup1: current.followup1,
          followup2: current.followup2,
        };
        const plan = planCall(snapshot, outcome);
        const line = `${today()} — ${outcome}${note ? ` : ${note}` : ""}`;
        const comment = current.comment ? `${current.comment}\n${line}` : line;
        return {
          input: {
            [plan.slot]: outcome,
            callState: plan.callState,
            comment: comment.slice(-2000),
            ...(plan.stage !== current.stage ? { stage: plan.stage } : {}),
          },
          autoStageReason: plan.stage !== current.stage ? `appel « ${outcome} »` : undefined,
        };
      });
      return detail(req.params.id);
    },
  );
}
