import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { orderController } from "../controllers/order.controller";
import { requireAuth, requireRole, optionalAuth } from "@/middleware/auth";
import { AddOrderNoteSchema, UpdateOrderStatusSchema } from "../validators/order.schema";
import { IdParamSchema } from "@/shared/dto";

export function orderRoutes(): Hono {
  const router = new Hono();

  // Customer
  const mine = new Hono();
  mine.use(requireAuth);
  mine.get("/", orderController.listMine);
  mine.get("/:id", zValidator("param", IdParamSchema), orderController.getMine);
  mine.get("/:id/invoice", zValidator("param", IdParamSchema), orderController.invoice);
  mine.get("/:id/packing-slip", zValidator("param", IdParamSchema), orderController.packingSlip);
  router.route("/me", mine);

  router.get("/track/:orderNumber", optionalAuth, orderController.trackByNumber);

  // Admin CMS
  const admin = new Hono();
  admin.use(requireAuth, requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"));
  admin.get("/", orderController.listAdmin);
  admin.get("/stats", orderController.stats);
  admin.get("/:id", zValidator("param", IdParamSchema), orderController.getAdmin);
  admin.patch("/:id/status", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", UpdateOrderStatusSchema), orderController.updateStatus);
  admin.post("/:id/notes", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("param", IdParamSchema), zValidator("json", AddOrderNoteSchema), orderController.addNote);
  admin.get("/:id/invoice", zValidator("param", IdParamSchema), orderController.adminInvoice);
  admin.get("/:id/packing-slip", zValidator("param", IdParamSchema), orderController.adminPackingSlip);

  router.route("/admin", admin);

  return router;
}
