import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth";
import { roleSchema } from "./roles";

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  role: roleSchema,
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    role: roleSchema,
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Au moins un champ à modifier");
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  active: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;
