import type { Role } from "@gac/shared";
import type { Config } from "./config";
import type { Db } from "./db/client";

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
    /** preHandler : exige une session valide. */
    authenticate: (req: FastifyRequest) => Promise<void>;
    /** preHandler : exige une session valide ET au moins le rôle indiqué. */
    requireRole: (minimum: Role) => (req: FastifyRequest) => Promise<void>;
  }
}
