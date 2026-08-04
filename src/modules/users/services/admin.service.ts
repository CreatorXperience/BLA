import { NotFoundError, ForbiddenError } from "@/shared/errors";
import { recordAudit } from "@/middleware/audit";
import { adminRepository } from "../repositories/admin.repository";
import type { Role, Prisma } from "@prisma/client";

export class AdminService {
  async listUsers(params: Parameters<typeof adminRepository.listUsers>[0]) {
    return adminRepository.listUsers(params);
  }

  async getUserDetails(id: string) {
    const user = await adminRepository.getUserDetails(id);
    if (!user) throw new NotFoundError("User not found");
    return user;
  }

  async updateRole(id: string, role: Role, actor?: { id: string; email: string }) {
    if (id === actor?.id) throw new ForbiddenError("Cannot change your own role");
    const user = await adminRepository.updateRole(id, role);
    if (actor) {
      await recordAudit({ actorId: actor.id, action: "UPDATE", entity: "User", entityId: id, metadata: { role } });
    }
    return user;
  }

  async updateStatus(id: string, isActive: boolean, actor?: { id: string; email: string }) {
    if (id === actor?.id) throw new ForbiddenError("Cannot suspend your own account");
    const user = await adminRepository.updateStatus(id, isActive);
    if (actor) {
      await recordAudit({ actorId: actor.id, action: "UPDATE", entity: "User", entityId: id, metadata: { isActive } });
    }
    return user;
  }

  async listAuditLogs(params: Parameters<typeof adminRepository.listAuditLogs>[0]) {
    return adminRepository.listAuditLogs(params);
  }
}

export const adminService = new AdminService();
