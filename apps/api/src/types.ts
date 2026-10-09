import type { Role } from "@gac/shared";
import type { Config } from "./config";
import type { Db } from "./db/client";
import type { DnsResolver } from "./mail/address-check";
import type { MailSender } from "./mail/brevo";

export interface AuthContext {
  sessionId: string;
  user: { id: string; email: string; name: string; role: Role };
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    config: Config;
    db: Db;
    /** Résolveur DNS du contrôle d'adresses (remplaçable en test). */
    dnsResolver: DnsResolver;
    /** Fournisseur d'e-mails ; null tant que la clé Brevo n'est pas fournie. */
    mailSender: MailSender | null;
    /** preHandler : exige une session valide. */
    authenticate: (req: FastifyRequest) => Promise<void>;
    /** preHandler : exige une session valide ET au moins le rôle indiqué. */
    requireRole: (minimum: Role) => (req: FastifyRequest) => Promise<void>;
  }
}
