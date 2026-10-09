import { createHash, randomBytes } from "node:crypto";

/** Jeton de session : 32 octets aléatoires, en base64url. Seule son empreinte est stockée. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
