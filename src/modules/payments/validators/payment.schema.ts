import { z } from "zod";
import { PaymentMethod, PaymentProvider } from "@prisma/client";

export const InitializePaymentSchema = z
  .object({
    orderId: z.string().min(1),
    provider: z.nativeEnum(PaymentProvider).default(PaymentProvider.PAYSTACK),
    method: z.nativeEnum(PaymentMethod).optional(),
    callbackUrl: z.string().url().optional(),
  })
  .strict();

export type InitializePaymentInput = z.infer<typeof InitializePaymentSchema>;

export const InitiatePaymentSchema = z
  .object({
    amount: z.coerce.number().positive(),
    currency: z.string().length(3).default("NGN"),
    email: z.string().email(),
    provider: z.nativeEnum(PaymentProvider).default(PaymentProvider.PAYSTACK),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export type InitiatePaymentInput = z.infer<typeof InitiatePaymentSchema>;

export const VerifyPaymentSchema = z
  .object({
    reference: z.string().min(1),
  })
  .strict();

export type VerifyPaymentInput = z.infer<typeof VerifyPaymentSchema>;

export const RefundPaymentSchema = z
  .object({
    paymentId: z.string().min(1),
    amount: z.coerce.number().positive().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type RefundPaymentInput = z.infer<typeof RefundPaymentSchema>;
