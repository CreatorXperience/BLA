import { z } from "zod";
import { CouponType } from "@prisma/client";

export const CreateCouponSchema = z
  .object({
    code: z.string().trim().min(1).max(50).toUpperCase(),
    type: z.nativeEnum(CouponType),
    value: z.coerce.number().positive(), // percentage or fixed amount
    maxDiscountAmount: z.coerce.number().positive().optional(),
    minPurchaseAmount: z.coerce.number().positive().optional(),
    freeShippingOnly: z.boolean().default(false),
    buyXGetYBuy: z.coerce.number().int().min(1).optional(),
    buyXGetYGet: z.coerce.number().int().min(1).optional(),
    isActive: z.boolean().default(true),
    startsAt: z.string().datetime().optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    usageLimit: z.coerce.number().int().min(1).optional(),
    perUserLimit: z.coerce.number().int().min(1).default(1),
    appliesTo: z.enum(["ALL", "CATEGORY", "COLLECTION", "PRODUCT"]).default("ALL"),
    applicableIds: z.array(z.string().min(1)).default([]),
    isSingleUse: z.boolean().default(false),
    isStackable: z.boolean().default(false),
    customerEmails: z.array(z.string().email()).default([]),
  })
  .strict();

export type CreateCouponInput = z.infer<typeof CreateCouponSchema>;

export const UpdateCouponSchema = CreateCouponSchema.partial();

export type UpdateCouponInput = z.infer<typeof UpdateCouponSchema>;

export const CouponQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
  type: z.nativeEnum(CouponType).optional(),
  isActive: z.string().optional(),
});

export type CouponQuery = z.infer<typeof CouponQuerySchema>;

export interface CouponValidationContext {
  subtotal: number;
  userId?: string;
  itemCount?: number;
  productIds?: string[];
  categoryIds?: string[];
  collectionIds?: string[];
  email?: string;
}

export interface CouponValidationResult {
  valid: boolean;
  coupon?: { id: string; code: string; type: CouponType; value: number };
  discount: number;
  message?: string;
}
