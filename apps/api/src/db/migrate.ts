import { runMigrations } from "./run-migrations";
import { waitForDatabase } from "./wait";

// Point d'entrée en ligne de commande (pnpm db:migrate, ou `node dist/migrate.js` dans l'image).
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL est obligatoire");
  process.exit(1);
}
const waitSeconds = Number(process.env.DB_WAIT_SECONDS ?? 60);
waitForDatabase(url, { timeoutMs: waitSeconds * 1000, log: console.log })
  .then(() => runMigrations(url))
  .then(() => console.log("Migrations appliquées"))
  .catch((err) => {
    console.error("Échec des migrations :", err instanceof Error ? err.message : err);
    process.exit(1);
  });
