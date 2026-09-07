import { AdminUsersRepository } from "./adminUsers.repository";
import type {
  AdminUserFilters,
  ChangeRoleInput,
  PaginatedUsers,
  ResetPasswordInput,
} from "./adminUsers.types";
import type { PublicUser } from "../../users/users.mapper";

export class AdminUsersService {
  constructor(private readonly repository: AdminUsersRepository) {}

  async listUsers(filters: AdminUserFilters): Promise<PaginatedUsers> {
    return this.repository.findMany(filters);
  }

  async getUserById(id: string): Promise<PublicUser> {
    const user = await this.repository.findById(id);
    if (!user) throw new Error("Usuário não encontrado");
    return user;
  }

  async blockUser(id: string): Promise<PublicUser> {
    const user = await this.repository.findById(id);
    if (!user) throw new Error("Usuário não encontrado");
    if (user.isBlocked) throw new Error("Usuário já está bloqueado");

    const updated = await this.repository.setBlocked(id, true);
    if (!updated) throw new Error("Falha ao bloquear usuário");
    return updated;
  }

  async unblockUser(id: string): Promise<PublicUser> {
    const user = await this.repository.findById(id);
    if (!user) throw new Error("Usuário não encontrado");
    if (!user.isBlocked) throw new Error("Usuário não está bloqueado");

    const updated = await this.repository.setBlocked(id, false);
    if (!updated) throw new Error("Falha ao desbloquear usuário");
    return updated;
  }

  async changeRole({ userId, newRole }: ChangeRoleInput): Promise<PublicUser> {
    const user = await this.repository.findById(userId);
    if (!user) throw new Error("Usuário não encontrado");
    if (user.role === newRole) throw new Error("Usuário já possui esta role");

    const updated = await this.repository.changeRole({ userId, newRole });
    if (!updated) throw new Error("Falha ao alterar role");
    return updated;
  }

  async resetPassword({
    userId,
    newPassword,
  }: ResetPasswordInput): Promise<void> {
    const user = await this.repository.findById(userId);
    if (!user) throw new Error("Usuário não encontrado");

    await this.repository.resetPassword({ userId, newPassword });
  }

  async deleteUser(id: string): Promise<PublicUser> {
    const user = await this.repository.findById(id);
    if (!user) throw new Error("Usuário não encontrado");

    const deleted = await this.repository.delete(id);
    if (!deleted) throw new Error("Falha ao deletar usuário");
    return deleted;
  }
}
