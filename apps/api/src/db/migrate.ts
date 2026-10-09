import { runMigrations } from "./run-migrations";

// Point d'entrée en ligne de commande (pnpm db:migrate, ou `node dist/migrate.js` dans l'image).
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL est obligatoire");
  process.exit(1);
}
runMigrations(url)
  .then(() => console.log("Migrations appliquées"))
  .catch((err) => {
    console.error("Échec des migrations :", err);
    process.exit(1);
  });
