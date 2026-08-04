import { OAuth2Client } from "google-auth-library";
import { Role } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { authRepository } from "../repositories/auth.repository";
import { hashPassword, verifyPassword } from "@/utils/password";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
} from "@/utils/token";
import {
  ConflictError,
  ForbiddenError,
  InvalidCredentialsError,
  NotFoundError,
  UnauthorizedError,
} from "@/shared/errors";
import { notificationService } from "@/modules/notifications/services/notification.service";
import {
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail,
  welcomeEmail,
} from "@/modules/notifications/services/templates";
import { env } from "@/config";
import { logger } from "@/shared/logger";
import type {
  AuthResponse,
  AuthTokens,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
} from "../types";

const ACCESS_TTL_SECONDS = 15 * 60;

function toAuthResponse(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  isEmailVerified: boolean;
  avatarUrl: string | null;
}, tokens: AuthTokens): AuthResponse {
  return { user, tokens };
}

export class AuthService {
  async register(input: RegisterInput, ctx?: { ip?: string; userAgent?: string }): Promise<AuthResponse> {
    const existing = await authRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await authRepository.createUser({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      marketingOptIn: input.marketingOptIn,
    });

    const tokens = await this.issueTokens(user, ctx);

    // Enqueue verification email
    const rawToken = generateOpaqueToken();
    await authRepository.createVerificationToken({
      userId: user.id,
      type: "EMAIL_VERIFICATION",
      rawToken,
      ttlMinutes: 60 * 24,
    });
    const verifyUrl = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
    await notificationService.queueEmail({
      to: user.email,
      subject: "Verify your email",
      template: "verify-email",
      data: { name: user.firstName ?? "there", verifyUrl },
    });
    // Send rendered HTML immediately too (worker renders templates by name).
    await notificationService.sendEmailNow({
      to: user.email,
      subject: "Verify your email",
      html: verificationEmail(user.firstName ?? "there", verifyUrl),
    });

    return toAuthResponse(this.sanitize(user), tokens);
  }

  async login(input: LoginInput, ctx?: { ip?: string; userAgent?: string }): Promise<AuthResponse> {
    const user = await authRepository.findByEmail(input.email);
    if (!user?.passwordHash) {
      throw new InvalidCredentialsError();
    }
    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) {
      throw new InvalidCredentialsError();
    }
    if (!user.isActive) {
      throw new ForbiddenError("This account has been deactivated");
    }

    const tokens = await this.issueTokens(user, ctx);
    await authRepository.updateLastLogin(user.id, ctx?.ip);

    return toAuthResponse(this.sanitize(user), tokens);
  }

  async refreshTokens(refreshToken: string, ctx?: { ip?: string; userAgent?: string }): Promise<AuthResponse> {
    const stored = await authRepository.findRefreshTokenByHash(hashOpaqueToken(refreshToken));
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError("Refresh token has been revoked or expired");
    }

    const user = await authRepository.findById(stored.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError("User no longer active");
    }

    // Rotation: revoke old token, issue new one.
    const newRaw = generateOpaqueToken();
    const newRefresh = await authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashOpaqueToken(newRaw),
      ttlDays: 30,
      ipAddress: ctx?.ip,
      userAgent: ctx?.userAgent,
    });
    await authRepository.revokeRefreshToken(stored.id, newRefresh.id);

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: stored.sessionId ?? undefined,
    });

    return toAuthResponse(this.sanitize(user), {
      accessToken,
      refreshToken: newRaw,
      expiresIn: ACCESS_TTL_SECONDS,
    });
  }

  async logout(refreshToken?: string, sessionId?: string): Promise<void> {
    if (refreshToken) {
      try {
        const stored = await authRepository.findRefreshTokenByHash(hashOpaqueToken(refreshToken));
        if (stored) await authRepository.revokeRefreshToken(stored.id);
      } catch {
        // ignore invalid tokens on logout
      }
    }
    if (sessionId) {
      await authRepository.revokeSession(sessionId);
    }
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await authRepository.findByEmail(input.email);
    if (!user) {
      // Always respond the same to avoid user enumeration.
      return;
    }

    const rawToken = generateOpaqueToken();
    await authRepository.createVerificationToken({
      userId: user.id,
      type: "PASSWORD_RESET",
      rawToken,
      ttlMinutes: 60,
    });
    const resetUrl = `${input.redirectUrl ?? env.CLIENT_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await notificationService.queueEmail({
      to: user.email,
      subject: "Reset your password",
      template: "password-reset",
      data: { name: user.firstName ?? "there", resetUrl },
    });
    await notificationService.sendEmailNow({
      to: user.email,
      subject: "Reset your password",
      html: passwordResetEmail(user.firstName ?? "there", resetUrl),
    });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const record = await authRepository.findValidVerificationToken("PASSWORD_RESET", rawToken);
    if (!record) {
      throw new UnauthorizedError("Reset token is invalid or expired");
    }

    const user = await authRepository.findById(record.userId);
    if (!user) throw new NotFoundError("User not found");

    const passwordHash = await hashPassword(newPassword);
    await authRepository.updateUser(user.id, {
      passwordHash,
      passwordChangedAt: new Date(),
    });
    await authRepository.markVerificationTokenUsed(record.id);
    await authRepository.revokeAllUserRefreshTokens(user.id);

    await notificationService.sendEmailNow({
      to: user.email,
      subject: "Your password has been changed",
      html: passwordChangedEmail(user.firstName ?? "there"),
    });
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const record = await authRepository.findValidVerificationToken("EMAIL_VERIFICATION", rawToken);
    if (!record) {
      throw new UnauthorizedError("Verification token is invalid or expired");
    }

    const user = await authRepository.findById(record.userId);
    if (!user) throw new NotFoundError("User not found");

    await authRepository.updateUser(user.id, { isEmailVerified: true, emailVerifiedAt: new Date() });
    await authRepository.markVerificationTokenUsed(record.id);

    await notificationService.sendEmailNow({
      to: user.email,
      subject: `Welcome to ${env.APP_NAME}`,
      html: welcomeEmail(user.firstName ?? "there"),
    });
  }

  async resendVerification(email: string): Promise<void> {
    const user = await authRepository.findByEmail(email);
    if (!user || user.isEmailVerified) return;

    const rawToken = generateOpaqueToken();
    await authRepository.createVerificationToken({
      userId: user.id,
      type: "EMAIL_VERIFICATION",
      rawToken,
      ttlMinutes: 60 * 24,
    });
    const verifyUrl = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
    await notificationService.sendEmailNow({
      to: user.email,
      subject: "Verify your email",
      html: verificationEmail(user.firstName ?? "there", verifyUrl),
    });
  }

  async googleLogin(idToken: string, ctx?: { ip?: string; userAgent?: string }): Promise<AuthResponse> {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new ForbiddenError("Google OAuth is not configured");
    }
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
    const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new UnauthorizedError("Invalid Google token");
    }

    let user = await authRepository.findByEmail(payload.email);
    if (!user) {
      user = await authRepository.createUser({
        email: payload.email,
        passwordHash: null,
        firstName: payload.given_name,
        lastName: payload.family_name,
        googleId: payload.sub,
      });
      await authRepository.createOAuthAccount({
        userId: user.id,
        provider: "GOOGLE",
        providerId: payload.sub,
      });
    } else if (!user.googleId) {
      await authRepository.updateUser(user.id, { googleId: payload.sub });
      await authRepository.createOAuthAccount({
        userId: user.id,
        provider: "GOOGLE",
        providerId: payload.sub,
      });
    }

    if (!user.isActive) {
      throw new ForbiddenError("This account has been deactivated");
    }

    const tokens = await this.issueTokens(user, ctx);
    await authRepository.updateLastLogin(user.id, ctx?.ip);
    return toAuthResponse(this.sanitize(user), tokens);
  }

  // --- private helpers ------------------------------------------------------

  private sanitize(user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: Role;
    isEmailVerified: boolean;
    avatarUrl: string | null;
  }) {
    return user;
  }

  private async issueTokens(
    user: { id: string; email: string; role: Role },
    ctx?: { ip?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    const rawRefresh = generateOpaqueToken();
    const refresh = await authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashOpaqueToken(rawRefresh),
      ttlDays: 30,
      ipAddress: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    const session = await authRepository.createSession({
      userId: user.id,
      token: generateOpaqueToken(),
      refreshTokenId: refresh.id,
      ipAddress: ctx?.ip,
      userAgent: ctx?.userAgent,
      ttlDays: 30,
    });
    // attach session to refresh token so sessions can be revoked via refresh token
    if (refresh.sessionId !== session.id) {
      await prismaUpdateRefreshSession(refresh.id, session.id);
    }

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: ACCESS_TTL_SECONDS,
    };
  }
}

async function prismaUpdateRefreshSession(refreshId: string, sessionId: string) {
  try {
    await prisma.refreshToken.update({
      where: { id: refreshId },
      data: { sessionId },
    });
  } catch (error) {
    logger.warn({ error }, "could not link refresh token to session");
  }
}

export const authService = new AuthService();
