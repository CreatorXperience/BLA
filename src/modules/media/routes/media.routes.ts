import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { mediaController } from "../controllers/media.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import { PresignUploadSchema, RegisterMediaSchema, UpdateMediaSchema, MediaQuerySchema } from "../validators/media.schema";
import { IdParamSchema } from "@/shared/dto";
import { rateLimit } from "@/middleware/rateLimit";

export function mediaRoutes(): Hono {
  const router = new Hono();
  router.use(requireAuth, requireRole("ADMIN", "MANAGER", "EDITOR", "SUPER_ADMIN"));

  router.post("/presign", zValidator("json", PresignUploadSchema), mediaController.presign);
  router.post("/register", zValidator("json", RegisterMediaSchema), mediaController.register);
  router.post(
    "/upload",
    rateLimit({ windowMs: 60_000, max: 30 }),
    mediaController.upload,
  );

  router.get("/", zValidator("query", MediaQuerySchema), mediaController.list);
  router.get("/folders", mediaController.folders);
  router.get("/:id", zValidator("param", IdParamSchema), mediaController.get);
  router.patch("/:id", zValidator("param", IdParamSchema), zValidator("json", UpdateMediaSchema), mediaController.update);
  router.delete("/:id", zValidator("param", IdParamSchema), mediaController.remove);

  return router;
}
