import { z } from "zod";
import { EmailSchema, PhoneSchema } from "@/shared/dto";

export const RegisterSchema = z
  .object({
    email: EmailSchema,
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters")
      .regex(/[a-z]/, "Password must contain a lowercase letter")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[0-9]/, "Password must contain a number"),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: PhoneSchema,
    marketingOptIn: z.boolean().default(true),
    redirectUrl: z.string().url().optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1, "Password is required"),
    rememberMe: z.boolean().default(false),
  })
  .strict();

export type LoginInput = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z
  .object({
    email: EmailSchema,
    redirectUrl: z.string().url().optional(),
  })
  .strict();

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z
  .object({
    token: z.string().min(20),
    password: z
      .string()
      .min(8)
      .max(72)
      .regex(/[a-z]/)
      .regex(/[A-Z]/)
      .regex(/[0-9]/),
  })
  .strict();

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const VerifyEmailSchema = z
  .object({
    token: z.string().min(20),
  })
  .strict();

export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

export const ResendVerificationSchema = z
  .object({
    email: EmailSchema,
  })
  .strict();

export type ResendVerificationInput = z.infer<typeof ResendVerificationSchema>;

export const RefreshTokenSchema = z
  .object({
    refreshToken: z.string().min(10),
  })
  .strict();

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

export const LogoutSchema = z
  .object({
    refreshToken: z.string().min(10).optional(),
    sessionId: z.string().optional(),
  })
  .strict();

export type LogoutInput = z.infer<typeof LogoutSchema>;

export const GoogleOAuthSchema = z
  .object({
    idToken: z.string().min(10),
    redirectUrl: z.string().url().optional(),
  })
  .strict();

export type GoogleOAuthInput = z.infer<typeof GoogleOAuthSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    isEmailVerified: boolean;
    avatarUrl: string | null;
  };
  tokens: AuthTokens;
}
