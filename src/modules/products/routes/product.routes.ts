import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { productController } from "../controllers/product.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import { optionalAuth } from "@/middleware/auth";
import {
  CreateProductSchema,
  DuplicateProductSchema,
  ProductFlagsSchema,
  PublishProductSchema,
  UpdateProductSchema,
  AdminProductQuerySchema,
  PublicProductQuerySchema,
} from "../validators/product.schema";
import { IdParamSchema } from "@/shared/dto";

export function productRoutes(): Hono {
  const router = new Hono();

  // Public catalog
  router.get("/", optionalAuth, zValidator("query", PublicProductQuerySchema), productController.listPublic);
  router.get("/featured", optionalAuth, productController.featured);
  router.get("/best-sellers", optionalAuth, productController.bestSellers);
  router.get("/trending", optionalAuth, productController.trending);
  router.get("/new-arrivals", optionalAuth, productController.newArrivals);
  router.get("/recommended", optionalAuth, productController.recommended);
  router.get("/recently-viewed", optionalAuth, productController.recentlyViewed);
  router.get("/:id/related", zValidator("param", IdParamSchema), productController.related);
  router.get("/slug/:slug", optionalAuth, productController.getPublic);

  // Admin CMS
  const admin = new Hono();
  admin.use(requireAuth, requireRole("ADMIN", "EDITOR", "MANAGER", "SUPER_ADMIN"));
  admin.get("/", zValidator("query", AdminProductQuerySchema), productController.listAdmin);
  admin.get("/stats", productController.stats);
  admin.get("/:id", zValidator("param", IdParamSchema), productController.getAdmin);
  admin.post("/", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("json", CreateProductSchema), productController.create);
  admin.patch("/:id", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", UpdateProductSchema), productController.update);
  admin.patch("/:id/flags", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", ProductFlagsSchema), productController.flags);
  admin.post("/:id/schedule", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", PublishProductSchema), productController.schedule);
  admin.post("/:id/archive", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), productController.archive);
  admin.post("/:id/restore", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), productController.restore);
  admin.delete("/:id", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("param", IdParamSchema), productController.remove);
  admin.post("/:id/duplicate", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", DuplicateProductSchema.optional()), productController.duplicate);

  router.route("/admin", admin);

  return router;
}
