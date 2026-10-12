import { createDb } from "../db/client";
import { waitForDatabase } from "../db/wait";
import { applyDemo } from "./apply";
import { buildDemo } from "./data";

/**
 * Données de démonstration, entièrement fictives (entreprises, noms, textes). Seuls les e-mails et les numéros
 * viennent de la ligne de commande : on met les siens, ainsi aucun message ni appel ne peut atteindre un tiers.
 *
 *   node dist/demo.js --emails=a@exemple.fr,b@exemple.fr --phones=0612345678,0687654321
 *   DEMO_ALLOW_RESET=1 node dist/demo.js --reset --confirm-reset --emails=… --phones=…   (vide d'abord la base métier)
 *
 * Les adresses sont déclinées en « nom+étiquette@domaine » : la boîte reçoit tout, les adresses restent distinctes.
 * À ne JAMAIS lancer sur la production : `--reset` efface leads, entreprises, contacts, e-mails et exclusions.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const emails = (opt("emails") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const phones = (opt("phones") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const url = process.env.DATABASE_URL;
  if (!url || emails.length === 0 || phones.length === 0) {
    console.error(
      "Usage : DATABASE_URL=… demo --emails=a@x.fr,b@y.fr --phones=06…,06… [--reset --confirm-reset]",
    );
    process.exit(2);
  }
  const reset = args.includes("--reset");
  if (reset && !(args.includes("--confirm-reset") && process.env.DEMO_ALLOW_RESET === "1")) {
    console.error(
      "--reset efface les données métier : ajoutez --confirm-reset et DEMO_ALLOW_RESET=1 (jamais en production).",
    );
    process.exit(2);
  }
  await waitForDatabase(url, { log: console.log });
  const { db, pool } = createDb(url);
  try {
    const demo = buildDemo({ emails, phones });
    console.log(await applyDemo(db, demo, { reset }));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Échec :", err instanceof Error ? err.message : err);
  process.exit(1);
});
