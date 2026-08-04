import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/database/prisma";

export class AdminRepository {
  async listUsers(params: {
    page: number;
    perPage: number;
    q?: string;
    role?: string;
    isActive?: string;
    sort: "createdAt" | "lastLoginAt";
    order: "asc" | "desc";
  }) {
    const where: Prisma.UserWhereInput = {
      ...(params.role ? { role: params.role as Prisma.UserWhereInput["role"] } : {}),
      ...(params.isActive !== undefined ? { isActive: params.isActive === "true" } : {}),
      ...(params.q
        ? {
            OR: [
              { email: { contains: params.q, mode: "insensitive" } },
              { firstName: { contains: params.q, mode: "insensitive" } },
              { lastName: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          emailVerifiedAt: true,
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { orders: true } },
        },
        orderBy: { [params.sort]: params.order },
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
      }),
      prisma.user.count({ where }),
    ]);
    return { data, total };
  }

  async getUserDetails(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
        addresses: { select: { id: true, label: true, firstName: true, lastName: true, country: true, city: true, isDefault: true } },
        _count: { select: { orders: true, reviews: true, notifications: true } },
      },
    });
  }

  async updateRole(id: string, role: Role) {
    return prisma.user.update({ where: { id }, data: { role } });
  }

  async updateStatus(id: string, isActive: boolean) {
    return prisma.user.update({
      where: { id },
      data: { isActive },
    });
  }

  async listAuditLogs(params: { page: number; perPage: number; entity?: string; action?: string; actorId?: string; from?: string; to?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(params.entity ? { entity: { contains: params.entity, mode: "insensitive" } } : {}),
      ...(params.action ? { action: params.action as Prisma.AuditLogWhereInput["action"] } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
      ...(params.from || params.to
        ? { createdAt: { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) } }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { data, total };
  }
}

export const adminRepository = new AdminRepository();
