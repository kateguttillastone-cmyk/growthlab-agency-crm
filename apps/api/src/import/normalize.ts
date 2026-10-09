import { createHash } from "node:crypto";
import type { Service } from "@gac/shared";

/** Texte nettoyé : espaces retirés, chaîne vide → null. */
export function cleanText(value: string | undefined | null): string | null {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  return v === "" ? null : v;
}

/** Texte multi-lignes (corps d'e-mail) : on garde les sauts de ligne, on retire les espaces de fin. */
export function cleanBlock(value: string | undefined | null): string | null {
  const v = (value ?? "").replace(/\r\n/g, "\n").trim();
  return v === "" ? null : v;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

export function normalizeEmail(value: string | undefined | null): string | null {
  const v = cleanText(value)?.toLowerCase() ?? null;
  return v && EMAIL_RE.test(v) ? v : null;
}

/** Domaine d'un site : sans protocole, sans « www. », sans chemin, paramètres ni port. */
export function normalizeDomain(url: string | undefined | null): string | null {
  const v = cleanText(url)?.toLowerCase();
  if (!v) return null;
  const host = v
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    ?.replace(/:\d+$/, "");
  return host?.includes(".") ? host : null;
}

/** Numéro français → format international (+33…). Les autres numéros internationaux sont conservés. */
export function normalizePhone(value: string | undefined | null): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return digits.length >= 8 ? `+${digits}` : null;
  if (digits.startsWith("0033") && digits.length === 13) return `+33${digits.slice(4)}`;
  if (digits.startsWith("33") && digits.length === 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+33${digits.slice(1)}`;
  return null;
}

/** Clé de comparaison de noms : minuscules, sans accents ni ponctuation, espaces réduits. */
export function nameKey(value: string | undefined | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseInteger(value: string | undefined | null): number | null {
  const v = cleanText(value);
  if (!v || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n <= 2_147_483_647 ? n : null;
}

export function parseDecimal(value: string | undefined | null): number | null {
  const v = cleanText(value)?.replace(",", ".");
  if (!v || !/^\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}

/** « 21/9/2026 » → « 2026-09-21 ». */
export function parseFrDate(value: string | undefined | null): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cleanText(value) ?? "");
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  )
    return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** « 24/9/2026 3:05pm » (heure locale de la base) + décalage « -04:00 » → date absolue. */
export function parseFrDateTime(value: string | undefined | null, offset: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(cleanText(value) ?? "");
  if (!m) return null;
  const [, d, mo, y, hh, mm, ap] = m;
  let hour = Number(hh) % 12;
  if (ap?.toLowerCase() === "pm") hour += 12;
  const day = parseFrDate(`${d}/${mo}/${y}`);
  if (!day) return null;
  const date = new Date(`${day}T${String(hour).padStart(2, "0")}:${mm}:00${offset}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseIsoDate(value: string | undefined | null): Date | null {
  const v = cleanText(value);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Case à cocher exportée en « checked » : vrai ; sinon faux si le site a été mesuré, inconnu sinon. */
export function parseCheckbox(value: string | undefined | null, measured: boolean): boolean | null {
  if (cleanText(value)?.toLowerCase() === "checked") return true;
  return measured ? false : null;
}

export function normalizeCountry(value: string | undefined | null): string {
  const v = nameKey(value);
  return v === "" || v === "fra" || v === "france" || v === "fr" ? "FR" : (cleanText(value) as string);
}

export interface NormalizedService {
  service: Service | null;
  /** Formulation d'origine, quand elle apporte une précision (campagne, suivi des conversions). */
  detail: string | null;
}

/**
 * Les 25 formulations libres de l'ancienne base (« Google Ads (Search) + Mise en place du tracking »,
 * « Création / refonte de site », …) sont ramenées à trois services. « Création / refonte » devient « Refonte »
 * quand l'entreprise a un site, « Création » sinon (règle de l'ancienne interface).
 */
export function normalizeService(raw: string | undefined | null, hasWebsite: boolean): NormalizedService {
  const v = cleanText(raw);
  if (!v) return { service: null, detail: null };
  const k = nameKey(v);
  if (k.includes("google ads") || k.startsWith("ads"))
    return { service: "Google Ads", detail: k === "google ads" ? null : v };
  if (k.includes("creation") || k.includes("refonte")) {
    return { service: hasWebsite ? "Refonte de site" : "Création de site", detail: null };
  }
  return { service: null, detail: v };
}

/** Empreinte stable d'une ligne : identifie le lead d'origine d'un import à l'autre. */
export function leadImportKey(parts: Array<string | null>): string {
  return createHash("sha1")
    .update(parts.map((p) => p ?? "").join("\u0001"))
    .digest("hex");
}

/**
 * Ville et code postal déduits d'une adresse française (« 12 rue des Lilas, 44000 Nantes, France »).
 * L'ancienne base ne renseignait pas la ville des prospects Google Maps, mais l'adresse la contient toujours.
 */
export function extractCityAndPostalCode(address: string | undefined | null): {
  city: string | null;
  postalCode: string | null;
} {
  const a = cleanText(address);
  if (!a) return { city: null, postalCode: null };
  const withCity = /\b(\d{5})\s+([^,]+?)\s*(?:,|$)/.exec(a);
  if (withCity) return { postalCode: withCity[1] ?? null, city: cleanText(withCity[2]) };
  const postalOnly = /\b(\d{5})\s*(?:,\s*[A-Za-z]{2,})?$/.exec(a);
  return { city: null, postalCode: postalOnly?.[1] ?? null };
}
