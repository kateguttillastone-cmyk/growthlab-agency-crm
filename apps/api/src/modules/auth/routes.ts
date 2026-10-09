import { changePasswordSchema, loginSchema, sessionUserSchema } from "@gac/shared";
import { and, eq, ne, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { sessions, users } from "../../db/schema";
import { authOf } from "../../lib/assert";
import { audit } from "../../lib/audit";
import { unauthenticated } from "../../lib/errors";
import { dummyHash, hashPassword, verifyPassword } from "../../lib/password";
import { hashToken, newSessionToken } from "../../lib/tokens";

const userResponse = z.object({ user: sessionUserSchema });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app;
  const r = app.withTypeProvider<ZodTypeProvider>();

  function setSessionCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(config.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
      maxAge: config.SESSION_MAX_DAYS * 86_400,
    });
  }

  r.post(
    "/auth/login",
    {
      schema: { body: loginSchema, response: { 200: userResponse } },
      config: { rateLimit: { max: config.LOGIN_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const { email, password } = req.body;
      const found = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
      const user = found[0];
      // Même message et même durée approximative que l'e-mail existe ou non, ou que le compte soit verrouillé.
      const generic = "E-mail ou mot de passe incorrect, ou compte temporairement verrouillé";
      const now = new Date();

      if (!user) {
        await verifyPassword(await dummyHash(), password);
        await audit(db, { action: "auth.login_failed", entityType: "user", data: { email }, ip: req.ip });
        throw unauthenticated(generic);
      }
      const locked = user.lockedUntil !== null && user.lockedUntil > now;
      const valid = await verifyPassword(user.passwordHash, password);
      if (locked || !user.active || !valid) {
        if (!valid && !locked && user.active) {
          const failures = user.failedLoginCount + 1;
          const lock = failures >= config.LOGIN_MAX_FAILURES;
          await db
            .update(users)
            .set({
              failedLoginCount: lock ? 0 : failures,
              lockedUntil: lock ? new Date(now.getTime() + config.LOGIN_LOCK_MINUTES * 60_000) : null,
            })
            .where(eq(users.id, user.id));
          if (lock) {
            await audit(db, {
              actorId: user.id,
              action: "auth.account_locked",
              entityType: "user",
              entityId: user.id,
              ip: req.ip,
            });
          }
        }
        await audit(db, {
          actorId: user.id,
          action: "auth.login_failed",
          entityType: "user",
          entityId: user.id,
          ip: req.ip,
        });
        throw unauthenticated(generic);
      }

      const token = newSessionToken();
      const idleEnd = new Date(now.getTime() + config.SESSION_IDLE_HOURS * 3_600_000);
      const absoluteEnd = new Date(now.getTime() + config.SESSION_MAX_DAYS * 86_400_000);
      await db.insert(sessions).values({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: idleEnd < absoluteEnd ? idleEnd : absoluteEnd,
        absoluteExpiresAt: absoluteEnd,
        ip: req.ip,
        userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
      });
      await db
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now })
        .where(eq(users.id, user.id));
      await audit(db, {
        actorId: user.id,
        action: "auth.login",
        entityType: "user",
        entityId: user.id,
        ip: req.ip,
      });

      setSessionCookie(reply, token);
      return { user: { id: user.id, email: user.email, name: user.name, role: user.role } };
    },
  );

  r.post("/auth/logout", async (req, reply) => {
    if (req.auth) {
      await db.delete(sessions).where(eq(sessions.id, req.auth.sessionId));
      await audit(db, {
        actorId: req.auth.user.id,
        action: "auth.logout",
        entityType: "user",
        entityId: req.auth.user.id,
        ip: req.ip,
      });
    }
    reply.clearCookie(config.SESSION_COOKIE_NAME, { path: "/" });
    return reply.status(204).send();
  });

  r.get(
    "/auth/me",
    { preHandler: app.authenticate, schema: { response: { 200: userResponse } } },
    async (req) => ({ user: authOf(req).user }),
  );

  r.post(
    "/auth/change-password",
    {
      preHandler: app.authenticate,
      schema: { body: changePasswordSchema },
      config: { rateLimit: { max: config.LOGIN_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const auth = authOf(req);
      const [row] = await db.select().from(users).where(eq(users.id, auth.user.id)).limit(1);
      if (!row || !(await verifyPassword(row.passwordHash, req.body.currentPassword))) {
        throw unauthenticated("Mot de passe actuel incorrect");
      }
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(req.body.newPassword), updatedAt: new Date() })
        .where(eq(users.id, row.id));
      // les autres appareils sont déconnectés ; la session courante est conservée
      await db.delete(sessions).where(and(eq(sessions.userId, row.id), ne(sessions.id, auth.sessionId)));
      await audit(db, {
        actorId: row.id,
        action: "auth.password_changed",
        entityType: "user",
        entityId: row.id,
        ip: req.ip,
      });
      return reply.status(204).send();
    },
  );
}
