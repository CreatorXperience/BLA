import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { inventoryController } from "../controllers/inventory.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import { AdjustStockSchema, CreateWarehouseSchema, ReserveStockSchema, SetStockSchema } from "../validators/inventory.schema";
import { IdParamSchema } from "@/shared/dto";

export function inventoryRoutes(): Hono {
  const router = new Hono();
  router.use(requireAuth, requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"));

  router.get("/", inventoryController.list);
  router.get("/stats", inventoryController.stats);
  router.get("/alerts", inventoryController.alerts);
  router.get("/movements", inventoryController.movements);
  router.get("/variants/:variantId", inventoryController.get);

  router.post("/set", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("json", SetStockSchema), inventoryController.setStock);
  router.post("/adjust", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("json", AdjustStockSchema), inventoryController.adjust);
  router.post("/reserve", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), zValidator("json", ReserveStockSchema), inventoryController.reserve);
  router.post("/variants/:variantId/receive", requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"), inventoryController.receiveIncoming);

  router.get("/warehouses", inventoryController.listWarehouses);
  router.post("/warehouses", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("json", CreateWarehouseSchema), inventoryController.createWarehouse);
  router.delete("/warehouses/:id", requireRole("ADMIN", "SUPER_ADMIN"), zValidator("param", IdParamSchema), inventoryController.removeWarehouse);

  return router;
}
