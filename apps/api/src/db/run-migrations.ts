import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Applique les migrations SQL du dossier `drizzle/`. Utilisable en ligne de commande ou depuis les tests. */
export async function runMigrations(connectionString: string, folder?: string): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // en développement : src/db -> ../../drizzle ; dans l'image : dist -> ../drizzle
  const migrationsFolder =
    folder ?? path.resolve(here, here.endsWith("dist") ? "../drizzle" : "../../drizzle");
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    // un seul migrateur à la fois, même si deux instances démarrent ensemble
    await pool.query("SELECT pg_advisory_lock(727274)");
    await migrate(drizzle(pool), { migrationsFolder });
    await pool.query("SELECT pg_advisory_unlock(727274)");
  } finally {
    await pool.end();
  }
}
