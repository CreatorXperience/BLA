import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { notificationController } from "../controllers/notification.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import { BroadcastSchema } from "../validators/notification.schema";

export function notificationRoutes(): Hono {
  const router = new Hono();

  router.use(requireAuth, requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"));

  router.post("/broadcast", zValidator("json", BroadcastSchema), notificationController.broadcast);
  router.get("/outbound", notificationController.listOutbound);
  router.get("/outbound/:id", notificationController.getOutbound);
  router.post("/outbound/:id/resend", notificationController.resend);

  return router;
}
