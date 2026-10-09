import { sql } from "drizzle-orm";
import type { Config } from "./config";
import type { Db } from "./db/client";
import { users } from "./db/schema";
import { one } from "./lib/assert";
import { audit } from "./lib/audit";
import { hashPassword } from "./lib/password";

/**
 * Crée le premier administrateur depuis SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, s'il n'existe pas encore.
 * Idempotent : un compte existant n'est JAMAIS modifié (ni son mot de passe, ni son rôle).
 */
export async function ensureSeedAdmin(
  db: Db,
  config: Config,
  log: { info: (m: string) => void },
): Promise<void> {
  const email = config.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = config.SEED_ADMIN_PASSWORD;
  if (!email || !password) return;
  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  if (found.length) return;
  const row = one(
    await db
      .insert(users)
      .values({ email, name: "Administrateur", role: "ADMIN", passwordHash: await hashPassword(password) })
      .returning({ id: users.id }),
  );
  await audit(db, { action: "user.seeded", entityType: "user", entityId: row.id, data: { email } });
  log.info(`Administrateur initial créé : ${email}`);
}
