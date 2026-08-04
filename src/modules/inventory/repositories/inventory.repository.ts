import { Prisma, MovementType, StockStatus } from "@prisma/client";
import { prisma } from "@/database/prisma";
import type { InventoryQuery, MovementQuery } from "../validators";

export interface MovementRecord {
  movementType: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: Date;
  variant: { sku: string; color: string | null; size: string | null; product: { name: string } } | null;
}

export class InventoryRepository {
  findByVariantId(variantId: string) {
    return prisma.inventory.findUnique({
      where: { variantId },
      include: { variant: { include: { product: { select: { id: true, name: true } } } } },
    });
  }

  findManyByVariantIds(variantIds: string[]) {
    return prisma.inventory.findMany({ where: { variantId: { in: variantIds } } });
  }

  createForVariant(variantId: string, quantity = 0) {
    return prisma.inventory.create({
      data: { variantId, quantity, status: quantity === 0 ? "OUT_OF_STOCK" : "IN_STOCK" },
    });
  }

  async adjust(variantId: string, change: number, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    const inventory = await client.inventory.findUnique({ where: { variantId } });
    if (!inventory) {
      return this.createForVariant(variantId, Math.max(0, change));
    }
    const quantityAfter = inventory.quantity + change;
    const safeAfter = Math.max(0, quantityAfter);
    return client.inventory.update({
      where: { variantId },
      data: {
        quantity: safeAfter,
        status: this.computeStatus(safeAfter, inventory.lowStockThreshold, inventory.allowBackorder),
      },
    });
  }

  async reserve(variantId: string, quantity: number, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.inventory.update({
      where: { variantId },
      data: { reserved: { increment: quantity } },
    });
  }

  async release(variantId: string, quantity: number, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    const inventory = await client.inventory.findUnique({ where: { variantId } });
    const released = inventory ? Math.min(inventory.reserved, quantity) : 0;
    return client.inventory.update({
      where: { variantId },
      data: { reserved: { decrement: released } },
    });
  }

  async set(variantId: string, data: Prisma.InventoryUpdateInput) {
    const inventory = await prisma.inventory.findUnique({ where: { variantId } });
    if (!inventory) {
      const quantity = Number(data.quantity ?? 0);
      return prisma.inventory.create({
        data: {
          variantId,
          quantity: Number.isFinite(quantity) ? quantity : 0,
          lowStockThreshold: Number(data.lowStockThreshold ?? 5),
          status: quantity === 0 ? "OUT_OF_STOCK" : "IN_STOCK",
        },
      });
    }
    return prisma.inventory.update({ where: { variantId }, data });
  }

  async recordHistory(params: {
    variantId: string;
    movementType: MovementType;
    quantityChange: number;
    quantityBefore: number;
    quantityAfter: number;
    referenceType?: string;
    referenceId?: string;
    note?: string;
    createdById?: string;
    tx?: Prisma.TransactionClient;
  }) {
    const client = params.tx ?? prisma;
    const inventory = await client.inventory.findUnique({ where: { variantId: params.variantId } });
    return client.inventoryHistory.create({
      data: {
        inventoryId: inventory?.id ?? "",
        variantId: params.variantId,
        movementType: params.movementType,
        quantityChange: params.quantityChange,
        quantityBefore: params.quantityBefore,
        quantityAfter: params.quantityAfter,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        note: params.note,
        createdById: params.createdById,
      },
    });
  }

  async list(query: InventoryQuery) {
    const where: Prisma.InventoryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.lowStockOnly === "true"
        ? { quantity: { lte: prisma.inventory.fields.lowStockThreshold } }
        : {}),
      ...(query.q
        ? {
            variant: {
              OR: [
                { sku: { contains: query.q, mode: "insensitive" as const } },
                { product: { name: { contains: query.q, mode: "insensitive" as const } } },
              ],
            },
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: {
          variant: {
            include: {
              product: { select: { id: true, name: true, slug: true } },
            },
          },
          warehouse: true,
        },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.inventory.count({ where }),
    ]);
    return { data, total, page: query.page, perPage: query.perPage };
  }

  async listMovements(query: MovementQuery) {
    const where: Prisma.InventoryHistoryWhereInput = {
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.movementType ? { movementType: query.movementType } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.inventoryHistory.findMany({
        where,
        include: { variant: { select: { sku: true, color: true, size: true, product: { select: { name: true } } } } },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        orderBy: { createdAt: "desc" },
      }),
      prisma.inventoryHistory.count({ where }),
    ]);
    return { data, total, page: query.page, perPage: query.perPage };
  }

  async findOpenLowStockAlert(variantId: string) {
    return prisma.lowStockAlert.findFirst({ where: { variantId, resolved: false } });
  }

  async createLowStockAlert(data: Prisma.LowStockAlertCreateInput) {
    return prisma.lowStockAlert.create({ data });
  }

  async resolveLowStockAlert(id: string) {
    return prisma.lowStockAlert.update({ where: { id }, data: { resolved: true, resolvedAt: new Date() } });
  }

  async listLowStockAlerts() {
    return prisma.lowStockAlert.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
  }

  computeStatus(quantity: number, lowStockThreshold: number, allowBackorder: boolean): StockStatus {
    if (quantity === 0 && allowBackorder) return "BACKORDER";
    if (quantity === 0) return "OUT_OF_STOCK";
    if (quantity <= lowStockThreshold) return "LOW_STOCK";
    return "IN_STOCK";
  }
}

export const inventoryRepository = new InventoryRepository();
