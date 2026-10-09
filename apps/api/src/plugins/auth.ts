import { hasRole, type Role } from "@gac/shared";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { sessions, users } from "../db/schema";
import { forbidden, unauthenticated } from "../lib/errors";
import { hashToken } from "../lib/tokens";

/** Intervalle minimal entre deux prolongations de session (évite une écriture par requête). */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function registerAuth(app: FastifyInstance): void {
  const { config, db } = app;
  app.decorateRequest("auth", null);

  // Charge la session (si le cookie en contient une valide) sur chaque requête.
  app.addHook("onRequest", async (req) => {
    const token = req.cookies[config.SESSION_COOKIE_NAME];
    if (!token) return;
    const now = new Date();
    const rows = await db
      .select({
        sessionId: sessions.id,
        lastSeenAt: sessions.lastSeenAt,
        absoluteExpiresAt: sessions.absoluteExpiresAt,
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          gt(sessions.expiresAt, now),
          gt(sessions.absoluteExpiresAt, now),
          eq(users.active, true),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return;
    req.auth = {
      sessionId: row.sessionId,
      user: { id: row.id, email: row.email, name: row.name, role: row.role },
    };
    if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      const idleEnd = new Date(now.getTime() + config.SESSION_IDLE_HOURS * 3_600_000);
      const expiresAt = idleEnd < row.absoluteExpiresAt ? idleEnd : row.absoluteExpiresAt;
      await db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, row.sessionId));
    }
  });

  app.decorate("authenticate", async (req: FastifyRequest) => {
    if (!req.auth) throw unauthenticated();
  });

  app.decorate("requireRole", (minimum: Role) => async (req: FastifyRequest) => {
    if (!req.auth) throw unauthenticated();
    if (!hasRole(req.auth.user.role, minimum)) throw forbidden();
  });
}
