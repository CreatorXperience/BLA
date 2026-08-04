import { z } from "zod";
import { MovementType } from "@prisma/client";

export const AdjustStockSchema = z
  .object({
    variantId: z.string().min(1),
    change: z.number().int(), // can be negative
    reason: z.string().trim().max(300).optional(),
    referenceType: z.string().trim().max(100).optional(),
    referenceId: z.string().optional(),
  })
  .strict();

export type AdjustStockInput = z.infer<typeof AdjustStockSchema>;

export const SetStockSchema = z
  .object({
    variantId: z.string().min(1),
    quantity: z.number().int().min(0),
    lowStockThreshold: z.number().int().min(0).optional(),
    reorderPoint: z.number().int().min(0).optional(),
    allowBackorder: z.boolean().optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export type SetStockInput = z.infer<typeof SetStockSchema>;

export const ReserveStockSchema = z
  .object({
    variantId: z.string().min(1),
    quantity: z.number().int().min(1),
    referenceId: z.string().optional(),
  })
  .strict();

export type ReserveStockInput = z.infer<typeof ReserveStockSchema>;

export const CreateWarehouseSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    code: z.string().trim().min(1).max(20).toUpperCase(),
    address: z.string().trim().max(300).optional(),
    city: z.string().trim().max(100).optional(),
    country: z.string().length(2).default("NG"),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateWarehouseInput = z.infer<typeof CreateWarehouseSchema>;

export const InventoryQuerySchema = z.object({
  status: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "BACKORDER"]).optional(),
  q: z.string().optional(),
  warehouseId: z.string().optional(),
  lowStockOnly: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export type InventoryQuery = z.infer<typeof InventoryQuerySchema>;

export const MovementQuerySchema = z.object({
  variantId: z.string().optional(),
  movementType: z.nativeEnum(MovementType).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export type MovementQuery = z.infer<typeof MovementQuerySchema>;
