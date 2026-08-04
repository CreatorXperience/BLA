import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { analyticsController } from "../controllers/analytics.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import { TrackEventSchema } from "../validators/analytics.schema";

export function analyticsRoutes(): Hono {
  const router = new Hono();

  // Tracking beacon — any authenticated user.
  router.post("/track", requireAuth, zValidator("json", TrackEventSchema), analyticsController.track);

  // Admin dashboard analytics.
  const admin = new Hono();
  admin.use(requireAuth, requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"));
  admin.get("/overview", analyticsController.overview);
  admin.get("/revenue", analyticsController.revenue);
  admin.get("/customers", analyticsController.customers);
  admin.get("/best-sellers", analyticsController.bestSellers);
  admin.get("/top-revenue-products", analyticsController.topRevenueProducts);
  admin.get("/traffic", analyticsController.traffic);
  admin.get("/conversion", analyticsController.conversion);

  router.route("/admin", admin);

  return router;
}
