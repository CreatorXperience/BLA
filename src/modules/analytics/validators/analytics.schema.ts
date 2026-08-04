import { z } from "zod";

export const TrackEventSchema = z
  .object({
    event: z.enum(["PAGE_VIEW", "PRODUCT_VIEW", "ADD_TO_CART", "CHECKOUT_START", "PURCHASE", "SEARCH"]),
    productId: z.string().optional(),
    categoryId: z.string().optional(),
    collectionId: z.string().optional(),
    value: z.coerce.number().optional(),
    currency: z.string().length(3).optional(),
    source: z.string().max(100).optional(),
    medium: z.string().max(100).optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .strict();

export type TrackEventInput = z.infer<typeof TrackEventSchema>;

export const AnalyticsRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  interval: z.enum(["day", "week", "month"]).default("day"),
});

export type AnalyticsRange = z.infer<typeof AnalyticsRangeSchema>;
