import { readFile } from "node:fs/promises";
import { createDb } from "../db/client";
import { waitForDatabase } from "../db/wait";
import { formatReport, importAirtableCsv } from "./airtable";

/**
 * Import de l'export CSV d'Airtable (une seule fois, rejouable sans doublon).
 *   pnpm --filter @gac/api import:airtable /chemin/export.csv --dry-run
 *   docker compose run --rm -v "$PWD/data:/data:ro" api node dist/import.js /data/export.csv --dry-run
 * Options : --dry-run (simulation), --tz=-04:00 (fuseau des dates sans fuseau de l'export).
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const tz = args.find((a) => a.startsWith("--tz="))?.slice(5);
  const url = process.env.DATABASE_URL;
  if (!file || !url) {
    console.error("Usage : DATABASE_URL=… import <fichier.csv> [--dry-run] [--tz=-04:00]");
    process.exit(2);
  }
  if (tz && !/^[+-]\d{2}:\d{2}$/.test(tz)) {
    console.error("--tz doit avoir la forme -04:00");
    process.exit(2);
  }
  await waitForDatabase(url, { log: console.log });
  const csv = await readFile(file, "utf8");
  const { db, pool } = createDb(url);
  try {
    const report = await importAirtableCsv(db, csv, { dryRun, ...(tz ? { timezoneOffset: tz } : {}) });
    console.log(formatReport(report));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Échec de l'import :", err instanceof Error ? err.message : err);
  process.exit(1);
});
