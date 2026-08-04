import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { reviewController } from "../controllers/review.controller";
import { requireAuth, requireRole, optionalAuth } from "@/middleware/auth";
import { CreateReviewSchema, ModerateReviewSchema, ReportReviewSchema, ReviewQuerySchema, AdminReviewQuerySchema } from "../validators/review.schema";
import { IdParamSchema } from "@/shared/dto";

export function reviewRoutes(): Hono {
  const router = new Hono();

  // Public
  router.get("/product/:productId", zValidator("query", ReviewQuerySchema), reviewController.listForProduct);

  // Customer
  router.post("/", requireAuth, zValidator("json", CreateReviewSchema), reviewController.create);
  router.post("/:id/like", requireAuth, zValidator("param", IdParamSchema), reviewController.like);
  router.post("/:id/report", requireAuth, zValidator("param", IdParamSchema), zValidator("json", ReportReviewSchema), reviewController.report);

  // Admin CMS
  const admin = new Hono();
  admin.use(requireAuth, requireRole("ADMIN", "MANAGER", "EDITOR", "SUPER_ADMIN"));
  admin.get("/", zValidator("query", AdminReviewQuerySchema), reviewController.listAdmin);
  admin.get("/stats", reviewController.stats);
  admin.patch("/:id/moderate", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", ModerateReviewSchema), reviewController.moderate);

  router.route("/admin", admin);

  return router;
}
