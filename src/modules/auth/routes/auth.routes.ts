import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authController } from "../controllers/auth.controller";
import {
  ForgotPasswordSchema,
  GoogleOAuthSchema,
  LoginSchema,
  LogoutSchema,
  RefreshTokenSchema,
  RegisterSchema,
  ResendVerificationSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
} from "../dto/auth.dto";
import { requireAuth } from "@/middleware/auth";
import { authRateLimit, rateLimit } from "@/middleware/rateLimit";

export function authRoutes(): Hono {
  const router = new Hono();

  router.post("/register", authRateLimit(), zValidator("json", RegisterSchema), authController.register);
  router.post("/login", authRateLimit(), zValidator("json", LoginSchema), authController.login);
  router.post("/refresh", zValidator("json", RefreshTokenSchema), authController.refresh);
  router.post("/logout", requireAuth, zValidator("json", LogoutSchema.optional()), authController.logout);
  router.post("/forgot-password", authRateLimit(), zValidator("json", ForgotPasswordSchema), authController.forgotPassword);
  router.post("/reset-password", authRateLimit(), zValidator("json", ResetPasswordSchema), authController.resetPassword);
  router.post("/verify-email", zValidator("json", VerifyEmailSchema), authController.verifyEmail);
  router.post("/resend-verification", rateLimit({ windowMs: 60_000, max: 3 }), zValidator("json", ResendVerificationSchema), authController.resendVerification);
  router.post("/google", authRateLimit(), zValidator("json", GoogleOAuthSchema), authController.googleOAuth);
  router.get("/me", requireAuth, authController.me);

  return router;
}
