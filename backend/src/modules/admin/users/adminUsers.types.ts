import { z } from "zod";
import type { User } from "../../../db/schema/users";
import type { PublicUser } from "../../users/users.mapper";
import type { Role } from "../permissions/roles";

export type { User };

export const AdminUserFiltersSchema = z.object({
  search: z.string().optional(), // busca por nome, username ou email
  role: z.custom<Role>().optional(),
  isBlocked: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});

export type AdminUserFilters = z.infer<typeof AdminUserFiltersSchema>;
export const PaginatedUsersSchema = z.object({
  data: z.array(z.custom<PublicUser>()),
  total: z.number().int().min(0),
  limit: z.number().int().positive(),
  offset: z.number().int().min(0),
});

export type PaginatedUsers = z.infer<typeof PaginatedUsersSchema>;
export const ChangeRoleInputSchema = z.object({
  userId: z.string().uuid("ID de usuário inválido"),
  newRole: z.custom<Role>(),
});

export type ChangeRoleInput = z.infer<typeof ChangeRoleInputSchema>;
// --- ResetPasswordInput ---
export const ResetPasswordInputSchema = z.object({
  userId: z.string().uuid("ID de usuário inválido"),
  newPassword: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;
