import { z } from "zod";

export const AddToWishlistSchema = z
  .object({
    productId: z.string().min(1),
  })
  .strict();

export type AddToWishlistInput = z.infer<typeof AddToWishlistSchema>;

export const MoveToCartSchema = z
  .object({
    variantId: z.string().min(1),
    quantity: z.coerce.number().int().min(1).max(99).default(1),
  })
  .strict();

export type MoveToCartInput = z.infer<typeof MoveToCartSchema>;
