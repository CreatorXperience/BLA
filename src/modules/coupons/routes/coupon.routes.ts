import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { couponController } from "../controllers/coupon.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import { CreateCouponSchema, UpdateCouponSchema } from "../validators/coupon.schema";
import { IdParamSchema } from "@/shared/dto";

export function couponRoutes(): Hono {
  const router = new Hono();
  router.use(requireAuth, requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"));

  router.get("/", couponController.list);
  router.get("/:id", zValidator("param", IdParamSchema), couponController.get);
  router.post("/", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("json", CreateCouponSchema), couponController.create);
  router.patch("/:id", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", UpdateCouponSchema), couponController.update);
  router.delete("/:id", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("param", IdParamSchema), couponController.remove);

  return router;
}
