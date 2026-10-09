import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { ensureSeedAdmin } from "./seed";

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  const app = await buildApp({ config, db });

  await ensureSeedAdmin(db, config, app.log);

  const stop = async (signal: string) => {
    app.log.info(`${signal} reçu, arrêt en cours`);
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
