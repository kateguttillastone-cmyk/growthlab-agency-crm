import {
  createUserSchema,
  type Page,
  paginationQuerySchema,
  resetPasswordSchema,
  roleSchema,
  type User,
  updateUserSchema,
  userSchema,
} from "@gac/shared";
import { and, count, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { sessions, type UserRow, users } from "../../db/schema";
import { authOf, one } from "../../lib/assert";
import { audit } from "../../lib/audit";
import { conflict, notFound } from "../../lib/errors";
import { hashPassword } from "../../lib/password";

const idParams = z.object({ id: z.uuid() });
const listQuery = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  active: z.enum(["true", "false"]).optional(),
});
const pageSchema = z.object({
  items: z.array(userSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export function toUserDto(u: UserRow): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const adminOnly = app.requireRole("ADMIN");

  async function activeAdminCount(): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.active, true)));
    return row?.n ?? 0;
  }

  r.get(
    "/users",
    { preHandler: adminOnly, schema: { querystring: listQuery, response: { 200: pageSchema } } },
    async (req) => {
      const { limit, offset, q, role, active } = req.query;
      const filters: SQL[] = [];
      if (q) {
        // \, % et _ sont des caractères spéciaux de LIKE : on les neutralise
        const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
        const match = or(ilike(users.email, pattern), ilike(users.name, pattern));
        if (match) filters.push(match);
      }
      if (role) filters.push(eq(users.role, role));
      if (active) filters.push(eq(users.active, active === "true"));
      const where = filters.length ? and(...filters) : undefined;
      const [rows, [total]] = await Promise.all([
        db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(limit).offset(offset),
        db.select({ n: count() }).from(users).where(where),
      ]);
      const page: Page<User> = { items: rows.map(toUserDto), total: total?.n ?? 0, limit, offset };
      return page;
    },
  );

  r.post(
    "/users",
    { preHandler: adminOnly, schema: { body: createUserSchema, response: { 201: userSchema } } },
    async (req, reply) => {
      const b = req.body;
      const exists = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${b.email}`)
        .limit(1);
      if (exists.length) throw conflict("Un compte existe déjà avec cet e-mail");
      const row = one(
        await db
          .insert(users)
          .values({
            email: b.email,
            name: b.name,
            role: b.role,
            passwordHash: await hashPassword(b.password),
          })
          .returning(),
      );
      await audit(db, {
        actorId: authOf(req).user.id,
        action: "user.created",
        entityType: "user",
        entityId: row.id,
        data: { email: b.email, role: b.role },
        ip: req.ip,
      });
      return reply.status(201).send(toUserDto(row));
    },
  );

  r.get(
    "/users/:id",
    { preHandler: adminOnly, schema: { params: idParams, response: { 200: userSchema } } },
    async (req) => {
      const [row] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!row) throw notFound("Utilisateur introuvable");
      return toUserDto(row);
    },
  );

  r.patch(
    "/users/:id",
    {
      preHandler: adminOnly,
      schema: { params: idParams, body: updateUserSchema, response: { 200: userSchema } },
    },
    async (req) => {
      const actor = authOf(req).user;
      const [current] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!current) throw notFound("Utilisateur introuvable");
      const b = req.body;
      const losesAdmin =
        current.role === "ADMIN" &&
        current.active &&
        ((b.role !== undefined && b.role !== "ADMIN") || b.active === false);
      if (losesAdmin) {
        if (current.id === actor.id)
          throw conflict("Vous ne pouvez pas retirer vos propres droits d'administrateur");
        if ((await activeAdminCount()) <= 1)
          throw conflict("Il doit rester au moins un administrateur actif");
      }
      if (b.active === false && current.id === actor.id)
        throw conflict("Vous ne pouvez pas désactiver votre propre compte");

      const row = one(
        await db
          .update(users)
          .set({ ...b, updatedAt: new Date() })
          .where(eq(users.id, current.id))
          .returning(),
      );
      // désactivation ou changement de rôle : les sessions ouvertes sont fermées
      if (b.active === false || (b.role !== undefined && b.role !== current.role)) {
        await db.delete(sessions).where(eq(sessions.userId, current.id));
      }
      await audit(db, {
        actorId: actor.id,
        action: "user.updated",
        entityType: "user",
        entityId: current.id,
        data: { changes: b },
        ip: req.ip,
      });
      return toUserDto(row);
    },
  );

  r.post(
    "/users/:id/reset-password",
    { preHandler: adminOnly, schema: { params: idParams, body: resetPasswordSchema } },
    async (req, reply) => {
      const [current] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!current) throw notFound("Utilisateur introuvable");
      await db
        .update(users)
        .set({
          passwordHash: await hashPassword(req.body.password),
          failedLoginCount: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, current.id));
      await db.delete(sessions).where(eq(sessions.userId, current.id));
      await audit(db, {
        actorId: authOf(req).user.id,
        action: "user.password_reset",
        entityType: "user",
        entityId: current.id,
        ip: req.ip,
      });
      return reply.status(204).send();
    },
  );
}
