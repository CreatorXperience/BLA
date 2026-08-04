import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { adminController } from "../controllers/admin.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import { UpdateUserRoleSchema, UpdateUserStatusSchema } from "../validators/admin.schema";
import { IdParamSchema } from "@/shared/dto";

export function adminRoutes(): Hono {
  const router = new Hono();

  router.use(requireAuth, requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"));

  router.get("/users", adminController.listUsers);
  router.get("/users/:id", zValidator("param", IdParamSchema), adminController.getUser);
  router.patch("/users/:id/role", zValidator("param", IdParamSchema), zValidator("json", UpdateUserRoleSchema), adminController.updateRole);
  router.patch("/users/:id/status", zValidator("param", IdParamSchema), zValidator("json", UpdateUserStatusSchema), adminController.updateStatus);

  router.get("/audit-logs", adminController.listAuditLogs);

  return router;
}
