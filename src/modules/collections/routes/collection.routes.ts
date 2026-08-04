import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { collectionController } from "../controllers/collection.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import { AddProductsSchema, CreateCollectionSchema, UpdateCollectionSchema } from "../validators/collection.schema";
import { IdParamSchema } from "@/shared/dto";

export function collectionRoutes(): Hono {
  const router = new Hono();

  // Public
  router.get("/", collectionController.list);
  router.get("/slug/:slug", collectionController.getBySlug);
  router.get("/:id", collectionController.get);

  // Admin CMS
  const admin = new Hono();
  admin.use(requireAuth, requireRole("ADMIN", "EDITOR", "MANAGER", "SUPER_ADMIN"));
  admin.post("/", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("json", CreateCollectionSchema), collectionController.create);
  admin.patch("/:id", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", UpdateCollectionSchema), collectionController.update);
  admin.post("/:id/products", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", AddProductsSchema), collectionController.addProducts);
  admin.delete("/:id/products/:productId", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), collectionController.removeProduct);
  admin.delete("/:id", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("param", IdParamSchema), collectionController.remove);

  router.route("/admin", admin);

  return router;
}
