import { z } from "zod";

export const BroadcastSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  audience: z.enum(["ALL_CUSTOMERS", "NEWS", "ALL"]).default("ALL"),
});

export type BroadcastInput = z.infer<typeof BroadcastSchema>;

export const OutboundMessageListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  channel: z.enum(["EMAIL", "SMS", "PUSH"]).optional(),
  status: z.enum(["PENDING", "QUEUED", "SENT", "FAILED"]).optional(),
});
