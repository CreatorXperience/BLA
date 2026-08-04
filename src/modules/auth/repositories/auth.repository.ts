import { Prisma, SessionStatus } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { hashOpaqueToken } from "@/utils/token";

export interface CreateUserInput {
  email: string;
  passwordHash: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  googleId?: string | null;
  marketingOptIn?: boolean;
}

export interface CreateSessionInput {
  userId: string;
  token: string;
  ipAddress?: string;
  userAgent?: string;
  refreshTokenId?: string;
  ttlDays: number;
}

export class AuthRepository {
  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  async createUser(data: CreateUserInput) {
    return prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        googleId: data.googleId,
        marketingOptIn: data.marketingOptIn,
      },
    });
  }

  async updateUser(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  }

  async createVerificationToken(params: {
    userId: string;
    type: string;
    rawToken: string;
    ttlMinutes: number;
  }) {
    const expiresAt = new Date(Date.now() + params.ttlMinutes * 60_000);
    await prisma.verificationToken.create({
      data: {
        userId: params.userId,
        type: params.type,
        tokenHash: hashOpaqueToken(params.rawToken),
        expiresAt,
      },
    });
    return expiresAt;
  }

  async findValidVerificationToken(type: string, rawToken: string) {
    const tokenHash = hashOpaqueToken(rawToken);
    return prisma.verificationToken.findFirst({
      where: {
        type,
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async markVerificationTokenUsed(id: string) {
    await prisma.verificationToken.update({ where: { id }, data: { usedAt: new Date() } });
  }

  async createRefreshToken(params: {
    userId: string;
    tokenHash: string;
    sessionId?: string;
    ttlDays: number;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const expiresAt = new Date(Date.now() + params.ttlDays * 86_400_000);
    return prisma.refreshToken.create({
      data: {
        userId: params.userId,
        token: params.tokenHash,
        sessionId: params.sessionId,
        expiresAt,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  }

  async findRefreshTokenById(id: string) {
    return prisma.refreshToken.findUnique({ where: { id } });
  }

  async revokeRefreshToken(id: string, replacedBy?: string) {
    return prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedBy },
    });
  }

  async revokeAllUserRefreshTokens(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async createSession(data: CreateSessionInput) {
    const expiresAt = new Date(Date.now() + data.ttlDays * 86_400_000);
    return prisma.session.create({
      data: {
        userId: data.userId,
        token: data.token,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        refreshTokenId: data.refreshTokenId,
        expiresAt,
      },
    });
  }

  async revokeSession(id: string) {
    return prisma.session.updateMany({
      where: { id, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED },
    });
  }

  async createOAuthAccount(params: {
    userId: string;
    provider: string;
    providerId: string;
    accessToken?: string;
    refreshToken?: string;
  }) {
    return prisma.oAuthAccount.create({
      data: {
        userId: params.userId,
        provider: params.provider as never,
        providerId: params.providerId,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
      },
    });
  }

  async findOAuthAccount(provider: string, providerId: string) {
    return prisma.oAuthAccount.findUnique({
      where: { provider_providerId: { provider: provider as never, providerId } },
      include: { user: true },
    });
  }

  async updateLastLogin(userId: string, ip?: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), lastLoginIp: ip },
    });
  }
}

export const authRepository = new AuthRepository();
