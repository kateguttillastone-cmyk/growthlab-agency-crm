import type { FastifyRequest } from "fastify";
import type { AuthContext } from "../types";
import { unauthenticated } from "./errors";

/** Session de la requête ; lève 401 si absente (les routes protégées passent déjà par `authenticate`). */
export function authOf(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}

/** Premier élément d'un résultat SQL qui doit en contenir un (INSERT … RETURNING, par exemple). */
export function one<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("Résultat SQL vide alors qu'une ligne était attendue");
  return row;
}
