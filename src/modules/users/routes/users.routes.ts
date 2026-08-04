import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { userController } from "../controllers/users.controller";
import { requireAuth } from "@/middleware/auth";
import {
  ChangePasswordSchema,
  CreateAddressSchema,
  NotificationPreferencesSchema,
  UpdateEmailSchema,
  UpdateProfileSchema,
} from "../dto/users.dto";
import { IdParamSchema } from "@/shared/dto";

export function userRoutes(): Hono {
  const router = new Hono();

  router.get("/me", requireAuth, userController.getProfile);
  router.patch("/me", requireAuth, zValidator("json", UpdateProfileSchema), userController.updateProfile);
  router.post("/me/change-password", requireAuth, zValidator("json", ChangePasswordSchema), userController.changePassword);
  router.post("/me/change-email", requireAuth, zValidator("json", UpdateEmailSchema), userController.updateEmail);

  router.get("/me/addresses", requireAuth, userController.listAddresses);
  router.post("/me/addresses", requireAuth, zValidator("json", CreateAddressSchema), userController.createAddress);
  router.patch("/me/addresses/:id", requireAuth, zValidator("param", IdParamSchema), zValidator("json", CreateAddressSchema), userController.updateAddress);
  router.delete("/me/addresses/:id", requireAuth, zValidator("param", IdParamSchema), userController.deleteAddress);

  router.get("/me/sessions", requireAuth, userController.listSessions);
  router.delete("/me/sessions/:id", requireAuth, zValidator("param", IdParamSchema), userController.revokeSession);
  router.post("/me/sessions/revoke-all", requireAuth, userController.revokeAllSessions);

  router.get("/me/notification-preferences", requireAuth, userController.getPreferences);
  router.put("/me/notification-preferences", requireAuth, zValidator("json", NotificationPreferencesSchema), userController.updatePreferences);

  router.get("/me/notifications", requireAuth, userController.listNotifications);
  router.post("/me/notifications/:id/read", requireAuth, zValidator("param", IdParamSchema), userController.markNotificationRead);

  return router;
}
