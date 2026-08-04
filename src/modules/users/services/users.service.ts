import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from "@/shared/errors";
import { hashPassword, verifyPassword } from "@/utils/password";
import { userRepository } from "../repositories/users.repository";
import { authRepository } from "@/modules/auth/repositories/auth.repository";
import { generateOpaqueToken } from "@/utils/token";
import { verificationEmail } from "@/modules/notifications/services/templates";
import { notificationService } from "@/modules/notifications/services/notification.service";
import { env } from "@/config";
import type {
  ChangePasswordInput,
  CreateAddressInput,
  NotificationPreferencesInput,
  UpdateEmailInput,
  UpdateProfileInput,
} from "../types";
import type { AddressData } from "../repositories/users.repository";

export class UserService {
  getProfile(userId: string) {
    return userRepository.findById(userId);
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const data: Record<string, unknown> = {};

    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.phone !== undefined) data.phone = input.phone ?? null;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
    if (input.locale !== undefined) data.locale = input.locale;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.marketingOptIn !== undefined) data.marketingOptIn = input.marketingOptIn;

    await userRepository.update(userId, data);
    return userRepository.findById(userId);
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    if (!user.isEmailVerified) {
      throw new ForbiddenError("Verify your email before changing your password");
    }

    const authUser = await authRepository.findById(userId);
    if (!authUser?.passwordHash) {
      throw new ForbiddenError("This account has no password (OAuth). Use password reset instead.");
    }
    const valid = await verifyPassword(authUser.passwordHash, input.currentPassword);
    if (!valid) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    const newHash = await hashPassword(input.newPassword);
    await userRepository.update(userId, { passwordHash: newHash, passwordChangedAt: new Date() });
    await authRepository.revokeAllUserRefreshTokens(userId);
  }

  async updateEmail(userId: string, input: UpdateEmailInput) {
    const existing = await authRepository.findByEmail(input.email);
    if (existing && existing.id !== userId) {
      throw new ConflictError("Email already in use");
    }
    const user = await userRepository.update(userId, { email: input.email, isEmailVerified: false });

    const rawToken = generateOpaqueToken();
    await authRepository.createVerificationToken({
      userId,
      type: "EMAIL_VERIFICATION",
      rawToken,
      ttlMinutes: 60 * 24,
    });
    const verifyUrl = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
    await notificationService.sendEmailNow({
      to: input.email,
      subject: "Verify your new email",
      html: verificationEmail(user.firstName ?? "there", verifyUrl),
    });
    return user;
  }

  // --- Addresses ------------------------------------------------------------

  listAddresses(userId: string) {
    return userRepository.listAddresses(userId);
  }

  async createAddress(userId: string, input: CreateAddressInput) {
    const data: AddressData = { ...input };
    if (input.isDefault) {
      await userRepository.clearDefaultAddress(userId, "");
    }
    if (input.isDefault) {
      const result = await userRepository.createAddress(userId, data);
      await userRepository.setDefaultAddress(userId, result.id);
      return result;
    }
    return userRepository.createAddress(userId, data);
  }

  async updateAddress(userId: string, addressId: string, input: CreateAddressInput) {
    const existing = await userRepository.findAddress(userId, addressId);
    if (!existing) throw new NotFoundError("Address not found");

    const data: PrismaAddressUpdate = { ...input };
    await userRepository.updateAddress(userId, addressId, data);

    if (input.isDefault) {
      await userRepository.setDefaultAddress(userId, addressId);
    }
    return userRepository.findAddress(userId, addressId);
  }

  async deleteAddress(userId: string, addressId: string) {
    const existing = await userRepository.findAddress(userId, addressId);
    if (!existing) throw new NotFoundError("Address not found");
    await userRepository.deleteAddress(userId, addressId);
  }

  // --- Sessions -------------------------------------------------------------

  listSessions(userId: string) {
    return userRepository.listSessions(userId);
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await userRepository.revokeSession(userId, sessionId);
    if (result.count === 0) throw new NotFoundError("Session not found");
  }

  revokeAllSessions(userId: string, exceptSessionId?: string) {
    return userRepository.revokeAllSessions(userId, exceptSessionId);
  }

  // --- Notification preferences ---------------------------------------------

  getNotificationPreferences(userId: string) {
    return userRepository.getNotificationPreferences(userId);
  }

  updateNotificationPreferences(userId: string, input: NotificationPreferencesInput) {
    return userRepository.upsertNotificationPreferences(userId, input.preferences);
  }

  // --- Notifications --------------------------------------------------------

  async listNotifications(userId: string, options: { page: number; perPage: number }) {
    const [total, data] = await userRepository.listNotifications(userId, options);
    return { data, total, page: options.page, perPage: options.perPage };
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const result = await userRepository.markNotificationRead(userId, notificationId);
    if (result.count === 0) throw new NotFoundError("Notification not found");
  }
}

type PrismaAddressUpdate = Record<string, unknown>;

export const userService = new UserService();
