import { z } from "zod";

export const AddToCartSchema = z
  .object({
    variantId: z.string().min(1),
    quantity: z.coerce.number().int().min(1).max(99).default(1),
  })
  .strict();

export type AddToCartInput = z.infer<typeof AddToCartSchema>;

export const UpdateCartItemSchema = z
  .object({
    quantity: z.coerce.number().int().min(1).max(99),
  })
  .strict();

export type UpdateCartItemInput = z.infer<typeof UpdateCartItemSchema>;

export const ApplyCouponSchema = z
  .object({
    code: z.string().trim().min(1).max(50).toUpperCase(),
  })
  .strict();

export type ApplyCouponInput = z.infer<typeof ApplyCouponSchema>;

export const CartShippingSchema = z
  .object({
    country: z.string().length(2),
    region: z.string().optional(),
    shippingMethodId: z.string().optional(),
  })
  .strict();

export type CartShippingInput = z.infer<typeof CartShippingSchema>;

export const MergeCartSchema = z.object({}).strict();

export interface CartItemDTO {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  slug: string;
  sku: string;
  color: string | null;
  size: string | null;
  imageUrl: string | null;
  unitPrice: string;
  compareAtPrice: string | null;
  quantity: number;
  lineTotal: string;
  inStock: boolean;
}

export interface CartTotals {
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  itemCount: number;
  totalQuantity: number;
}

export interface CartResponse {
  id: string;
  token: string;
  status: string;
  currency: string;
  items: CartItemDTO[];
  totals: CartTotals;
  coupon: { code: string; type: string; discount: number } | null;
  shipping: { methodId: string | null; methodName: string | null; estimate: number; available: Array<{ id: string; name: string; rate: number; estimatedDays: string }> } | null;
}
