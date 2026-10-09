import { paginationQuerySchema } from "@gac/shared";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { auditEvents } from "../../db/schema";

const query = paginationQuerySchema.extend({
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(100).optional(),
  action: z.string().max(100).optional(),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      "/audit-events",
      { preHandler: app.requireRole("ADMIN"), schema: { querystring: query } },
      async (req) => {
        const { limit, offset, entityType, entityId, action } = req.query;
        const filters: SQL[] = [];
        if (entityType) filters.push(eq(auditEvents.entityType, entityType));
        if (entityId) filters.push(eq(auditEvents.entityId, entityId));
        if (action) filters.push(eq(auditEvents.action, action));
        const where = filters.length ? and(...filters) : undefined;
        const [items, [total]] = await Promise.all([
          db
            .select()
            .from(auditEvents)
            .where(where)
            .orderBy(desc(auditEvents.at), desc(auditEvents.id))
            .limit(limit)
            .offset(offset),
          db.select({ n: count() }).from(auditEvents).where(where),
        ]);
        return {
          items: items.map((e) => ({ ...e, at: e.at.toISOString() })),
          total: total?.n ?? 0,
          limit,
          offset,
        };
      },
    );
}
