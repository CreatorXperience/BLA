import type { Context } from "hono";
import { authService } from "../services/auth.service";
import { success } from "@/shared/apiResponse";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import { getAuth } from "@/middleware/auth";
import type {
  ForgotPasswordInput,
  GoogleOAuthInput,
  LoginInput,
  LogoutInput,
  RefreshTokenInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "../types";

function clientMeta(c: Context) {
  return {
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: c.req.header("user-agent"),
  };
}

export class AuthController {
  register = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as RegisterInput;
    const result = await authService.register(body, clientMeta(c));
    await recordAudit({ actorId: result.user.id, action: AuditAction.CREATE, entity: "User", entityId: result.user.id, metadata: { via: "register" }, c });
    return c.json(success(result, "Registration successful"), 201);
  };

  login = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as LoginInput;
    const result = await authService.login(body, clientMeta(c));
    await recordAudit({ actorId: result.user.id, action: AuditAction.LOGIN, entity: "User", entityId: result.user.id, metadata: { via: "credentials" }, c });
    return c.json(success(result, "Login successful"));
  };

  refresh = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as RefreshTokenInput;
    const result = await authService.refreshTokens(body.refreshToken, clientMeta(c));
    return c.json(success(result, "Token refreshed"));
  };

  logout = async (c: Context): Promise<Response> => {
    const body = (await c.req.json().catch(() => ({}))) as LogoutInput;
    const auth = c.get("auth") as { user?: { id: string } } | undefined;
    await authService.logout(body.refreshToken, body.sessionId);
    await recordAudit({ actorId: auth?.user?.id, action: AuditAction.LOGOUT, entity: "User", entityId: auth?.user?.id, c });
    return c.json(success(null, "Logged out successfully"));
  };

  forgotPassword = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as ForgotPasswordInput;
    await authService.forgotPassword(body);
    return c.json(success(null, "If that email exists, a reset link has been sent"));
  };

  resetPassword = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as ResetPasswordInput;
    await authService.resetPassword(body.token, body.password);
    return c.json(success(null, "Password reset successfully"));
  };

  verifyEmail = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as VerifyEmailInput;
    await authService.verifyEmail(body.token);
    return c.json(success(null, "Email verified successfully"));
  };

  resendVerification = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as ResendVerificationInput;
    await authService.resendVerification(body.email);
    return c.json(success(null, "Verification email sent"));
  };

  googleOAuth = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as GoogleOAuthInput;
    const result = await authService.googleLogin(body.idToken, clientMeta(c));
    await recordAudit({ actorId: result.user.id, action: AuditAction.LOGIN, entity: "User", entityId: result.user.id, metadata: { via: "google" }, c });
    return c.json(success(result, "Google sign-in successful"));
  };

  me = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    return c.json(success(user, "Authenticated user"));
  };
}

export const authController = new AuthController();
