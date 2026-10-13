import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

export interface SiteResponse {
  /** Adresse finale, après redirections. */
  url: string;
  status: number;
  headers: Record<string, string>;
  html: string;
}

export type SiteFetcher = (url: string) => Promise<SiteResponse | null>;

/** Adresse non routable publiquement : boucle locale, réseaux privés, lien local (dont les métadonnées cloud 169.254.x.x), multicast. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::") return true;
    if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
    return (
      x.startsWith("fc") ||
      x.startsWith("fd") ||
      x.startsWith("fe8") ||
      x.startsWith("fe9") ||
      x.startsWith("fea") ||
      x.startsWith("feb") ||
      x.startsWith("ff")
    );
  }
  return true; // pas une adresse IP : refusé
}

const MAX_BYTES = 400_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 6_000;

export interface SafeFetchOptions {
  /** Tests seulement : autorise les adresses privées (serveur local). */
  allowPrivate?: boolean;
}

/**
 * Récupère la page d'accueil d'un site de prospect. Le serveur ne doit jamais pouvoir être poussé à interroger son propre réseau :
 * l'adresse IP est contrôlée AU MOMENT de la connexion (donc aussi à chaque redirection, et contre le « DNS rebinding »),
 * http/https seulement, pas d'identifiants dans l'adresse, 3 redirections, 400 Ko, 6 secondes.
 */
export function safeFetcher(opts: SafeFetchOptions = {}): SiteFetcher {
  const lookup = (
    hostname: string,
    options: unknown,
    cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ) => {
    dnsLookup(hostname, { all: true }, (err, addrs) => {
      if (err) return cb(err, "");
      const bad = addrs.find((a) => !opts.allowPrivate && isPrivateAddress(a.address));
      if (bad || addrs.length === 0)
        return cb(Object.assign(new Error("adresse non autorisée"), { code: "EBLOCKED" }), "");
      const wantAll = typeof options === "object" && options !== null && (options as { all?: boolean }).all;
      return wantAll ? cb(null, addrs) : cb(null, addrs[0]?.address ?? "", addrs[0]?.family);
    });
  };

  const once = (target: URL): Promise<{ status: number; headers: Record<string, string>; body: string }> =>
    new Promise((resolve, reject) => {
      const lib = target.protocol === "https:" ? https : http;
      const req = lib.request(
        target,
        {
          method: "GET",
          lookup: lookup as never,
          timeout: TIMEOUT_MS,
          headers: { "user-agent": "GACPilot/1.0 (+analyse de site)", accept: "text/html,*/*;q=0.5" },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (c: Buffer) => {
            size += c.length;
            if (size > MAX_BYTES) {
              res.destroy();
              return;
            }
            chunks.push(c);
          });
          const done = () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: Object.fromEntries(
                Object.entries(res.headers).map(([k, v]) => [
                  k,
                  Array.isArray(v) ? v.join(", ") : String(v ?? ""),
                ]),
              ),
              body: Buffer.concat(chunks).toString("utf8"),
            });
          res.on("end", done);
          res.on("close", done);
          res.on("error", reject);
        },
      );
      req.on("timeout", () => req.destroy(new Error("délai dépassé")));
      req.on("error", reject);
      req.end();
    });

  return async (start) => {
    let url: URL;
    try {
      url = new URL(start);
    } catch {
      return null;
    }
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password)
        return null;
      // une adresse IP littérale est contrôlée tout de suite (le contrôle de connexion ne voit pas de résolution DNS)
      if (
        isIP(url.hostname.replace(/^\[|\]$/g, "")) &&
        !opts.allowPrivate &&
        isPrivateAddress(url.hostname.replace(/^\[|\]$/g, ""))
      ) {
        return null;
      }
      let res: Awaited<ReturnType<typeof once>>;
      try {
        res = await once(url);
      } catch {
        return null;
      }
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        try {
          url = new URL(res.headers.location, url);
        } catch {
          return null;
        }
        continue;
      }
      return { url: url.toString(), status: res.status, headers: res.headers, html: res.body };
    }
    return null;
  };
}
