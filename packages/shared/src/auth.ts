import { z } from "zod";
import { roleSchema } from "./roles";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères`)
  .max(PASSWORD_MAX_LENGTH);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Adresse e-mail invalide").max(254));

export const loginSchema = z.object({
  email: emailSchema,
  // pas de règle de longueur à la connexion : on ne révèle rien sur la politique de mot de passe
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const sessionUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
});
export type SessionUser = z.infer<typeof sessionUserSchema>;
