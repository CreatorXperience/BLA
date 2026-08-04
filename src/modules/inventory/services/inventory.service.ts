import { MovementType } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { inventoryRepository } from "../repositories/inventory.repository";
import { ConflictError, InsufficientStockError, NotFoundError } from "@/shared/errors";
import { inventoryAlertQueue } from "@/queues";
import { logger } from "@/shared/logger";
import type { AdjustStockInput, CreateWarehouseInput, ReserveStockInput, SetStockInput } from "../validators";
import type { InventoryQuery, MovementQuery } from "../validators";

export class InventoryService {
  getByVariant(variantId: string) {
    return inventoryRepository.findByVariantId(variantId);
  }

  async list(query: InventoryQuery) {
    const result = await inventoryRepository.list(query);
    return result;
  }

  async listMovements(query: MovementQuery) {
    return inventoryRepository.listMovements(query);
  }

  async setStock(input: SetStockInput, actorId?: string) {
    const before = await inventoryRepository.findByVariantId(input.variantId);
    if (!before) {
      throw new NotFoundError("Variant not found");
    }

    const after = await inventoryRepository.set(input.variantId, {
      quantity: input.quantity,
      ...(input.lowStockThreshold !== undefined && { lowStockThreshold: input.lowStockThreshold }),
      ...(input.reorderPoint !== undefined && { reorderPoint: input.reorderPoint }),
      ...(input.allowBackorder !== undefined && { allowBackorder: input.allowBackorder }),
      status: inventoryRepository.computeStatus(
        input.quantity,
        input.lowStockThreshold ?? before.lowStockThreshold,
        input.allowBackorder ?? before.allowBackorder,
      ),
    });

    await inventoryRepository.recordHistory({
      variantId: input.variantId,
      movementType: MovementType.ADJUSTMENT,
      quantityChange: input.quantity - before.quantity,
      quantityBefore: before.quantity,
      quantityAfter: input.quantity,
      note: input.note ?? "Manual stock set",
      createdById: actorId,
    });

    await this.checkLowStock(input.variantId, after);
    return after;
  }

  async adjust(input: AdjustStockInput, actorId?: string) {
    const before = await inventoryRepository.findByVariantId(input.variantId);
    if (!before) throw new NotFoundError("Variant not found");

    if (input.change < 0 && before.quantity + input.change < 0) {
      throw new InsufficientStockError("Cannot reduce stock below zero", { variantId: input.variantId });
    }

    const after = await inventoryRepository.adjust(input.variantId, input.change);
    await inventoryRepository.recordHistory({
      variantId: input.variantId,
      movementType: input.change >= 0 ? MovementType.PURCHASE : MovementType.ADJUSTMENT,
      quantityChange: input.change,
      quantityBefore: before.quantity,
      quantityAfter: after.quantity,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      note: input.reason,
      createdById: actorId,
    });

    await this.checkLowStock(input.variantId, after);
    return after;
  }

  async reserveStock(input: ReserveStockInput) {
    const inventory = await inventoryRepository.findByVariantId(input.variantId);
    if (!inventory) throw new NotFoundError("Variant not found");

    const available = inventory.quantity - inventory.reserved;
    if (available < input.quantity) {
      throw new InsufficientStockError("Not enough stock available", {
        variantId: input.variantId,
        available,
        requested: input.quantity,
      });
    }

    return inventoryRepository.reserve(input.variantId, input.quantity);
  }

  async releaseStock(variantId: string, quantity: number) {
    return inventoryRepository.release(variantId, quantity);
  }

  /**
   * Atomic sale deduction inside an order transaction. Reduces quantity,
   * releases reservation, records the movement. Throws if stock is short.
   */
  deductForOrder = this.deductForOrderTx;

  async deductForOrderTx(
    tx: { inventory: { findUnique: (args: unknown) => Promise<unknown>; update: (args: unknown) => Promise<unknown> }; inventoryHistory: { create: (args: unknown) => Promise<unknown> } },
    items: Array<{ variantId: string; quantity: number }>,
  ) {
    for (const item of items) {
      const inv = (await tx.inventory.findUnique({
        where: { variantId: item.variantId },
      })) as { id: string; quantity: number; reserved: number; lowStockThreshold: number; allowBackorder: boolean } | null;

      if (!inv) {
        throw new InsufficientStockError(`No inventory for variant ${item.variantId}`);
      }
      if (inv.quantity < item.quantity) {
        throw new InsufficientStockError("Insufficient stock", {
          variantId: item.variantId,
          available: inv.quantity,
          requested: item.quantity,
        });
      }

      const quantityAfter = inv.quantity - item.quantity;
      await tx.inventory.update({
        where: { variantId: item.variantId },
        data: {
          quantity: quantityAfter,
          reserved: Math.max(0, inv.reserved - item.quantity),
          status: inventoryRepository.computeStatus(quantityAfter, inv.lowStockThreshold, inv.allowBackorder),
        },
      });
      await tx.inventoryHistory.create({
        data: {
          inventoryId: inv.id,
          variantId: item.variantId,
          movementType: MovementType.SALE,
          quantityChange: -item.quantity,
          quantityBefore: inv.quantity,
          quantityAfter,
        },
      });
    }
  }

  /** Decrement stock without reservation requirement (fallback path). */
  async deductWithoutReservation(items: Array<{ variantId: string; quantity: number }>, referenceId?: string) {
    for (const item of items) {
      const before = await inventoryRepository.findByVariantId(item.variantId);
      if (!before) throw new InsufficientStockError("Variant not found");
      if (before.quantity < item.quantity) {
        throw new InsufficientStockError("Insufficient stock", { variantId: item.variantId, available: before.quantity });
      }
      const after = await inventoryRepository.adjust(item.variantId, -item.quantity);
      await inventoryRepository.recordHistory({
        variantId: item.variantId,
        movementType: MovementType.SALE,
        quantityChange: -item.quantity,
        quantityBefore: before.quantity,
        quantityAfter: after.quantity,
        referenceId,
      });
    }
  }

  /** Restore stock for a cancelled order (reverse the SALE movement). */
  async restoreForCancelledOrder(items: Array<{ variantId: string; quantity: number }>, referenceId?: string) {
    for (const item of items) {
      const before = await inventoryRepository.findByVariantId(item.variantId);
      if (!before) continue;
      const after = await inventoryRepository.adjust(item.variantId, item.quantity);
      await inventoryRepository.recordHistory({
        variantId: item.variantId,
        movementType: MovementType.RETURN,
        quantityChange: item.quantity,
        quantityBefore: before.quantity,
        quantityAfter: after.quantity,
        referenceId,
        note: "Stock restored after order cancellation",
      });
      await this.checkLowStock(item.variantId, after);
    }
  }

  async addIncoming(variantId: string, quantity: number) {
    const inventory = await inventoryRepository.findByVariantId(variantId);
    if (!inventory) throw new NotFoundError("Variant not found");
    return prisma.inventory.update({
      where: { variantId },
      data: { incoming: { increment: quantity } },
    });
  }

  /** When purchase order lands: incoming -> quantity. */
  async receiveIncoming(variantId: string, quantity: number, actorId?: string) {
    const before = await inventoryRepository.findByVariantId(variantId);
    if (!before) throw new NotFoundError("Variant not found");
    const receive = Math.min(before.incoming, quantity);
    const after = await prisma.inventory.update({
      where: { variantId },
      data: {
        incoming: { decrement: receive },
        quantity: { increment: receive },
        status: inventoryRepository.computeStatus(before.quantity + receive, before.lowStockThreshold, before.allowBackorder),
      },
    });
    await inventoryRepository.recordHistory({
      variantId,
      movementType: MovementType.PURCHASE,
      quantityChange: receive,
      quantityBefore: before.quantity,
      quantityAfter: after.quantity,
      referenceType: "PURCHASE_ORDER",
      createdById: actorId,
    });
    await this.checkLowStock(variantId, after);
    return after;
  }

  // --- warehouses -----------------------------------------------------------

  listWarehouses() {
    return prisma.warehouse.findMany({ orderBy: { name: "asc" } });
  }

  async createWarehouse(input: CreateWarehouseInput) {
    const existing = await prisma.warehouse.findUnique({ where: { code: input.code } });
    if (existing) throw new ConflictError("Warehouse code already exists");
    return prisma.warehouse.create({ data: input });
  }

  async removeWarehouse(id: string) {
    const inventoryCount = await prisma.inventory.count({ where: { warehouseId: id } });
    if (inventoryCount > 0) {
      throw new ConflictError("Cannot delete a warehouse that has inventory");
    }
    return prisma.warehouse.delete({ where: { id } });
  }

  // --- low stock alerts -----------------------------------------------------

  private async checkLowStock(variantId: string, inventory: { quantity: number; lowStockThreshold: number }) {
    const open = await inventoryRepository.findOpenLowStockAlert(variantId);
    const isLow = inventory.quantity > 0 && inventory.quantity <= inventory.lowStockThreshold;

    if (isLow && !open) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
        include: { product: { select: { id: true, name: true } } },
      });
      const alert = await inventoryRepository.createLowStockAlert({
        variantId,
        productId: variant?.product.id ?? "",
        sku: variant?.sku ?? "",
        currentQty: inventory.quantity,
        threshold: inventory.lowStockThreshold,
      });
      await inventoryAlertQueue.add("low-stock-alert", {
        variantId,
        productId: alert.productId,
        sku: alert.sku,
        currentQty: alert.currentQty,
        threshold: alert.threshold,
      });
      logger.warn({ variantId, sku: alert.sku, quantity: inventory.quantity }, "low stock alert created");
    } else if (!isLow && open) {
      await inventoryRepository.resolveLowStockAlert(open.id);
    }
  }

  listOpenLowStockAlerts() {
    return inventoryRepository.listLowStockAlerts();
  }

  async stats() {
    const [inStock, lowStock, outOfStock, backorder] = await Promise.all([
      prisma.inventory.count({ where: { status: "IN_STOCK" } }),
      prisma.inventory.count({ where: { status: "LOW_STOCK" } }),
      prisma.inventory.count({ where: { status: "OUT_OF_STOCK" } }),
      prisma.inventory.count({ where: { status: "BACKORDER" } }),
    ]);
    return { inStock, lowStock, outOfStock, backorder };
  }
}

export const inventoryService = new InventoryService();
