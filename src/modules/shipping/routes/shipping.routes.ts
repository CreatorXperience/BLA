import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { shippingController } from "../controllers/shipping.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import {
  CreateShippingMethodSchema,
  CreateShippingRuleSchema,
  CreateShippingZoneSchema,
  EstimateShippingSchema,
  UpdateShippingMethodSchema,
  UpdateShippingZoneSchema,
} from "../validators/shipping.schema";
import { IdParamSchema } from "@/shared/dto";

export function shippingRoutes(): Hono {
  const router = new Hono();

  // Public estimate endpoint
  router.post("/estimate", zValidator("json", EstimateShippingSchema), shippingController.estimate);

  // Admin CMS
  const admin = new Hono();
  admin.use(requireAuth, requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"));

  admin.get("/zones", shippingController.listZones);
  admin.post("/zones", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("json", CreateShippingZoneSchema), shippingController.createZone);
  admin.patch("/zones/:id", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", UpdateShippingZoneSchema), shippingController.updateZone);
  admin.delete("/zones/:id", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("param", IdParamSchema), shippingController.removeZone);

  admin.post("/methods", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("json", CreateShippingMethodSchema), shippingController.createMethod);
  admin.patch("/methods/:id", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", UpdateShippingMethodSchema), shippingController.updateMethod);
  admin.delete("/methods/:id", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("param", IdParamSchema), shippingController.removeMethod);

  admin.post("/rules", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("json", CreateShippingRuleSchema), shippingController.createRule);
  admin.delete("/rules/:id", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("param", IdParamSchema), shippingController.removeRule);

  router.route("/admin", admin);

  return router;
}
