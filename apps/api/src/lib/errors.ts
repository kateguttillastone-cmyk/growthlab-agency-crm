import type { ErrorCode } from "@gac/shared";

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const unauthenticated = (message = "Authentification requise") =>
  new AppError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "Accès refusé") => new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Ressource introuvable") => new AppError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new AppError(409, "CONFLICT", message);
