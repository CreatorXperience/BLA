import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { categoryController } from "../controllers/category.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import { CreateCategorySchema, UpdateCategorySchema, CategoryQuerySchema } from "../validators/category.schema";
import { IdParamSchema } from "@/shared/dto";

export function categoryRoutes(): Hono {
  const router = new Hono();

  // Public
  router.get("/", zValidator("query", CategoryQuerySchema), categoryController.list);
  router.get("/slug/:slug", categoryController.getBySlug);
  router.get("/:id", categoryController.get);

  // Admin CMS
  const admin = new Hono();
  admin.use(requireAuth, requireRole("ADMIN", "EDITOR", "MANAGER", "SUPER_ADMIN"));
  admin.post("/", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("json", CreateCategorySchema), categoryController.create);
  admin.patch("/:id", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", UpdateCategorySchema), categoryController.update);
  admin.delete("/:id", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("param", IdParamSchema), categoryController.remove);

  router.route("/admin", admin);

  return router;
}
