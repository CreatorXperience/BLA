import { z } from "zod";
import { PaymentMethod, PaymentProvider } from "@prisma/client";

export const CheckoutAddressSchema = z
  .object({
    addressId: z.string().optional(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().regex(/^[+0-9][0-9\s-]{6,17}$/).optional(),
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().max(20).optional(),
    country: z.string().length(2).default("NG"),
  })
  .strict();

export type CheckoutAddressInput = z.infer<typeof CheckoutAddressSchema>;

export const CheckoutShippingSchema = z
  .object({
    shippingAddress: CheckoutAddressSchema,
    shippingMethodId: z.string().min(1),
    saveAddress: z.boolean().default(false),
    email: z.string().email(),
  })
  .strict();

export type CheckoutShippingInput = z.infer<typeof CheckoutShippingSchema>;

export const CheckoutPreviewSchema = z
  .object({
    email: z.string().email(),
    shippingAddress: CheckoutAddressSchema,
    billingAddress: CheckoutAddressSchema.optional(),
    shippingMethodId: z.string().min(1),
    couponCode: z.string().trim().max(50).toUpperCase().optional(),
  })
  .strict();

export type CheckoutPreviewInput = z.infer<typeof CheckoutPreviewSchema>;

export const CreateOrderSchema = z
  .object({
    email: z.string().email(),
    shippingAddress: CheckoutAddressSchema,
    billingAddress: CheckoutAddressSchema.optional(),
    billingSameAsShipping: z.boolean().default(true),
    shippingMethodId: z.string().min(1),
    couponCode: z.string().trim().max(50).toUpperCase().optional(),
    payment: z
      .object({
        provider: z.nativeEnum(PaymentProvider).default(PaymentProvider.PAYSTACK),
        method: z.nativeEnum(PaymentMethod).optional(),
        callbackUrl: z.string().url().optional(),
      })
      .default({}),
    customerNote: z.string().trim().max(1000).optional(),
  })
  .strict();

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export interface CheckoutSummary {
  items: Array<{
    productId: string;
    variantId: string;
    name: string;
    sku: string;
    color: string | null;
    size: string | null;
    imageUrl: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  itemCount: number;
  coupon: { code: string; discount: number } | null;
  shipping: { methodId: string; methodName: string; estimatedDays: string } | null;
}
