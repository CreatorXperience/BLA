import { Prisma, SessionStatus } from "@prisma/client";
import { prisma } from "@/database/prisma";

export interface AddressData {
  label?: string | null;
  type?: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode?: string | null;
  country?: string;
  isDefault?: boolean;
}

export class UserRepository {
  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        locale: true,
        currency: true,
        marketingOptIn: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  }

  listAddresses(userId: string) {
    return prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  createAddress(userId: string, data: AddressData) {
    return prisma.address.create({
      data: { userId, ...data } as Prisma.AddressUncheckedCreateInput,
    });
  }

  findAddress(userId: string, addressId: string) {
    return prisma.address.findFirst({ where: { id: addressId, userId } });
  }

  updateAddress(userId: string, addressId: string, data: Prisma.AddressUpdateInput) {
    return prisma.address.updateMany({ where: { id: addressId, userId }, data });
  }

  deleteAddress(userId: string, addressId: string) {
    return prisma.address.deleteMany({ where: { id: addressId, userId } });
  }

  async setDefaultAddress(userId: string, addressId: string) {
    await prisma.$transaction([
      prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
      prisma.address.updateMany({ where: { id: addressId, userId }, data: { isDefault: true } }),
    ]);
  }

  async clearDefaultAddress(userId: string, addressId: string) {
    const remaining = await prisma.address.count({ where: { userId, id: { not: addressId } } });
    await prisma.address.updateMany({ where: { id: addressId, userId }, data: { isDefault: remaining === 0 } });
  }

  listSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId, status: SessionStatus.ACTIVE },
      orderBy: { lastUsedAt: "desc" },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        status: true,
      },
    });
  }

  revokeSession(userId: string, sessionId: string) {
    return prisma.session.updateMany({
      where: { id: sessionId, userId, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED },
    });
  }

  revokeAllSessions(userId: string, exceptSessionId?: string) {
    return prisma.session.updateMany({
      where: {
        userId,
        status: SessionStatus.ACTIVE,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { status: SessionStatus.REVOKED },
    });
  }
}

export const userRepository = new UserRepository();
