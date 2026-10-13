import type { Role } from "@gac/shared";
import type { AiClient } from "./ai/anthropic";
import type { Config } from "./config";
import type { Db } from "./db/client";
import type { DnsResolver } from "./mail/address-check";
import type { MailSender } from "./mail/brevo";
import type { SourcingProvider } from "./sourcing/provider";

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
    /** Fournisseur de prospects (sourcing) ; null tant que le sourcing est désactivé ou sans jeton. */
    sourcingProvider: SourcingProvider | null;
    /** Client IA (Anthropic) ; null tant que la clé n'est pas fournie. */
    aiClient: AiClient | null;
    /** preHandler : exige une session valide. */
    authenticate: (req: FastifyRequest) => Promise<void>;
    /** preHandler : exige une session valide ET au moins le rôle indiqué. */
    requireRole: (minimum: Role) => (req: FastifyRequest) => Promise<void>;
  }
}
