import { runMigrations } from "../src/db/run-migrations";

/**
 * Prépare la base de test (migrations). DATABASE_URL doit viser une base JETABLE : les tables
 * sont vidées entre les tests. Par sécurité, le nom de la base doit contenir « test ».
 */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "postgresql://gac:gac@localhost:5432/gac_test";
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.includes("test")) {
    throw new Error(`Refus d'exécuter les tests sur la base « ${dbName} » : son nom doit contenir « test ».`);
  }
  process.env.DATABASE_URL = url;
  await runMigrations(url);
}
