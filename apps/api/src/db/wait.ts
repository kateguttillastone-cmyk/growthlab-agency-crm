import pg from "pg";

/** Codes d'erreur réseau ou PostgreSQL qui signifient « pas encore prêt » : on réessaie. */
const RETRYABLE = new Set([
  "ECONNREFUSED", // le serveur n'écoute pas encore
  "ENOTFOUND", // le nom du service n'est pas encore (ou plus) résolu
  "EAI_AGAIN", // DNS momentanément indisponible
  "ETIMEDOUT",
  "ECONNRESET",
  "57P03", // la base démarre
  "57P01", // arrêt administrateur
  "08001",
  "08004",
  "08006",
]);

export interface WaitOptions {
  /** Durée maximale d'attente (défaut 60 s). */
  timeoutMs?: number;
  /** Pause entre deux essais (défaut 2 s). */
  intervalMs?: number;
  log?: (message: string) => void;
}

function codeOf(err: unknown): string | undefined {
  const e = err as { code?: string; errors?: Array<{ code?: string }> };
  // « localhost » peut donner plusieurs adresses : pg renvoie alors une AggregateError
  return e.code ?? e.errors?.find((x) => x.code)?.code;
}

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return "(inconnu)";
  }
}

/**
 * Attend que la base accepte les connexions. Au démarrage d'une pile Docker, l'API et la base se lancent
 * en même temps : sans attente, la première erreur réseau faisait tomber l'API pour de bon.
 * Une erreur qui ne se règle pas en attendant (mot de passe refusé, base inexistante) échoue tout de suite.
 */
export async function waitForDatabase(connectionString: string, opts: WaitOptions = {}): Promise<void> {
  const { timeoutMs = 60_000, intervalMs = 2_000, log = () => {} } = opts;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5_000 });
    try {
      await client.connect();
      await client.query("select 1");
      if (attempt > 1) log(`Base de données joignable après ${attempt} essais`);
      return;
    } catch (err) {
      const code = codeOf(err);
      if (!code || !RETRYABLE.has(code)) throw err;
      if (Date.now() + intervalMs >= deadline) {
        const host = hostOf(connectionString);
        const hint =
          code === "ENOTFOUND" || code === "EAI_AGAIN"
            ? `Le nom « ${host} » n'est pas résolu : le service est-il lancé, et l'API est-elle sur le même réseau Docker ?`
            : `Le serveur « ${host} » n'accepte pas les connexions : est-il démarré et en bonne santé ?`;
        throw new Error(`Base de données injoignable après ${attempt} essais (${code}). ${hint}`);
      }
      log(`Base de données pas encore prête (${code}), nouvel essai dans ${Math.round(intervalMs / 1000)} s`);
      await new Promise((r) => setTimeout(r, intervalMs));
    } finally {
      await client.end().catch(() => {});
    }
  }
}
