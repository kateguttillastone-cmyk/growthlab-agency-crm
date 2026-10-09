import { promises as dns } from "node:dns";
import type { AddressCheck } from "@gac/shared";

/** Domaines de messagerie jetable les plus courants (liste volontairement courte et sûre). */
const DISPOSABLE = new Set([
  "mailinator.com",
  "yopmail.com",
  "yopmail.fr",
  "guerrillamail.com",
  "sharklasers.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "trashmail.com",
  "throwawaymail.com",
  "getnada.com",
  "maildrop.cc",
]);

const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

/** Découpe une adresse bien formée en (partie locale, domaine) ; null si elle est mal formée. */
export function splitAddress(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || email.length > 254) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (local.length > 64 || !LOCAL.test(local)) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  if (!/^[a-z]{2,}$|^xn--/i.test(labels[labels.length - 1] ?? "")) return null;
  return { local, domain };
}

export interface DnsResolver {
  resolveMx(domain: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

export const systemResolver: DnsResolver = {
  resolveMx: (d) => dns.resolveMx(d),
  resolve4: (d) => dns.resolve4(d),
  resolve6: (d) => dns.resolve6(d),
};

const ABSENT = new Set(["ENOTFOUND", "ENODATA"]);
const codeOf = (e: unknown) => (e as { code?: string } | null)?.code ?? "";

/**
 * Le domaine reçoit-il du courrier ? `valid` (MX, ou à défaut une adresse A/AAAA, comme le prévoit la norme),
 * `no_mail_server` (le domaine n'existe pas ou n'annonce aucun serveur, y compris « MX nul »), ou `null` quand le
 * DNS n'a pas répondu (délai dépassé, serveur en erreur) : on ne condamne jamais une adresse sur une panne.
 */
export async function checkDomain(
  domain: string,
  resolver: DnsResolver = systemResolver,
  timeoutMs = 4000,
): Promise<"valid" | "no_mail_server" | null> {
  const guarded = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(Object.assign(new Error("délai dépassé"), { code: "ETIMEOUT" })),
          timeoutMs,
        ).unref(),
      ),
    ]);
  try {
    const mx = await guarded(resolver.resolveMx(domain));
    const real = mx.filter((m) => m.exchange.replace(/\.$/, "") !== "");
    if (real.length) return "valid";
    return "no_mail_server"; // MX nul (RFC 7505) : le domaine déclare ne recevoir aucun courrier
  } catch (e) {
    if (!ABSENT.has(codeOf(e))) return null;
  }
  try {
    const [a, aaaa] = await Promise.all([
      guarded(resolver.resolve4(domain)).catch((e) => (ABSENT.has(codeOf(e)) ? [] : Promise.reject(e))),
      guarded(resolver.resolve6(domain)).catch((e) => (ABSENT.has(codeOf(e)) ? [] : Promise.reject(e))),
    ]);
    return a.length || aaaa.length ? "valid" : "no_mail_server";
  } catch {
    return null;
  }
}

/** Contrôles sans réseau (syntaxe, adresse jetable) ; null si l'adresse mérite le contrôle du domaine. */
export function checkLocally(email: string): Exclude<AddressCheck, "valid" | "no_mail_server"> | null {
  const parts = splitAddress(email);
  if (!parts) return "invalid_syntax";
  if (DISPOSABLE.has(parts.domain)) return "disposable";
  return null;
}
