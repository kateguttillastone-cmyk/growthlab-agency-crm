import type { ApiErrorBody, ErrorCode } from "@gac/shared";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** Appelé quand l'API répond 401 en dehors de la connexion (session expirée). */
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

export async function api<T = void>(
  path: string,
  options: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      // un FormData fixe lui-même son content-type (avec la frontière du multipart) : ne pas le forcer
      headers: options.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      signal: options.signal,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Le serveur est injoignable. Vérifiez votre connexion.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data: unknown = text ? safeJson(text) : null;
  if (!res.ok) {
    const e = (data as ApiErrorBody | null)?.error;
    if (res.status === 401 && !path.startsWith("/auth/login")) for (const fn of unauthorizedListeners) fn();
    throw new ApiError(
      res.status,
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? `Erreur ${res.status}`,
      e?.details,
    );
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Une erreur est survenue";
}
