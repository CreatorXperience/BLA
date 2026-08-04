import { z } from "zod";
import { OrderStatus } from "@prisma/client";

export const UpdateOrderStatusSchema = z
  .object({
    status: z.nativeEnum(OrderStatus),
    reason: z.string().trim().max(500).optional(),
    trackingNumber: z.string().trim().max(100).optional(),
    courier: z.string().trim().max(100).optional(),
    notifyCustomer: z.boolean().default(true),
  })
  .strict();

export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

export const AddOrderNoteSchema = z
  .object({
    note: z.string().trim().min(1).max(1000),
  })
  .strict();

export type AddOrderNoteInput = z.infer<typeof AddOrderNoteSchema>;

export const AdminOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(OrderStatus).optional(),
  q: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sort: z.enum(["newest", "oldest", "total-desc", "total-asc"]).default("newest"),
});

export type AdminOrderQuery = z.infer<typeof AdminOrderQuerySchema>;

export const UserOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(OrderStatus).optional(),
});

export type UserOrderQuery = z.infer<typeof UserOrderQuerySchema>;

export interface OrderTimelineEntry {
  status: string;
  label: string;
  description: string;
  at: Date;
}
