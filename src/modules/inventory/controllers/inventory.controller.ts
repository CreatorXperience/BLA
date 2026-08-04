import type { Context } from "hono";
import { inventoryService } from "../services/inventory.service";
import { success, paginationMeta } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import type { AdjustStockInput, ReserveStockInput, SetStockInput, CreateWarehouseInput } from "../validators";
import type { InventoryQuery, MovementQuery } from "../validators";

export class InventoryController {
  list = async (c: Context): Promise<Response> => {
    const query = c.req.valid("query" as never) as InventoryQuery;
    const result = await inventoryService.list(query);
    return c.json(success(result.data, "Inventory", { pagination: paginationMeta(result.page, result.perPage, result.total) }));
  };

  get = async (c: Context): Promise<Response> => {
    const variantId = c.req.param("variantId") ?? "";
    const inventory = await inventoryService.getByVariant(variantId);
    return c.json(success(inventory, "Inventory"));
  };

  movements = async (c: Context): Promise<Response> => {
    const query = c.req.valid("query" as never) as MovementQuery;
    const result = await inventoryService.listMovements(query);
    return c.json(success(result.data, "Stock movements", { pagination: paginationMeta(result.page, result.perPage, result.total) }));
  };

  setStock = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as SetStockInput;
    const result = await inventoryService.setStock(body, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Inventory", entityId: body.variantId, metadata: { quantity: body.quantity }, c });
    return c.json(success(result, "Stock updated"));
  };

  adjust = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as AdjustStockInput;
    const result = await inventoryService.adjust(body, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Inventory", entityId: body.variantId, metadata: { change: body.change, reason: body.reason }, c });
    return c.json(success(result, "Stock adjusted"));
  };

  reserve = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as ReserveStockInput;
    const result = await inventoryService.reserveStock(body);
    return c.json(success(result, "Stock reserved"));
  };

  receiveIncoming = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const variantId = c.req.param("variantId") ?? "";
    const body = (await c.req.json()) as { quantity: number };
    const result = await inventoryService.receiveIncoming(variantId, body.quantity, user.id);
    return c.json(success(result, "Incoming stock received"));
  };

  // Warehouses
  listWarehouses = async (c: Context): Promise<Response> => {
    const result = await inventoryService.listWarehouses();
    return c.json(success(result, "Warehouses"));
  };

  createWarehouse = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as CreateWarehouseInput;
    const result = await inventoryService.createWarehouse(body);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "Warehouse", entityId: result.id, c });
    return c.json(success(result, "Warehouse created"), 201);
  };

  removeWarehouse = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    await inventoryService.removeWarehouse(id);
    await recordAudit({ actorId: user.id, action: AuditAction.DELETE, entity: "Warehouse", entityId: id, c });
    return c.json(success(null, "Warehouse deleted"));
  };

  alerts = async (c: Context): Promise<Response> => {
    const alerts = await inventoryService.listOpenLowStockAlerts();
    return c.json(success(alerts, "Low stock alerts"));
  };

  stats = async (c: Context): Promise<Response> => {
    const stats = await inventoryService.stats();
    return c.json(success(stats, "Inventory stats"));
  };
}

export const inventoryController = new InventoryController();
