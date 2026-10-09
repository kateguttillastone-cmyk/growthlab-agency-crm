import { createHmac, timingSafeEqual } from "node:crypto";

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** Jeton de désinscription : l'adresse (en base64url) et sa signature HMAC. Impossible à forger sans le secret. */
export function signUnsubscribe(email: string, secret: string): string {
  const payload = b64(email.toLowerCase());
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Adresse contenue dans un jeton valide, sinon null. */
export function verifyUnsubscribe(token: string, secret: string): string | null {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const email = Buffer.from(payload, "base64url").toString("utf8");
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
}
