import { z } from "zod";

/** Common URL param: id. */
export const IdParamSchema = z.object({
  id: z.string().min(1),
});

export const SlugParamSchema = z.object({
  slug: z.string().min(1),
});

export type IdParam = z.infer<typeof IdParamSchema>;
export type SlugParam = z.infer<typeof SlugParamSchema>;

/** Offset pagination query (page/perPage). */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** Cursor pagination query. */
export const CursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CursorQuery = z.infer<typeof CursorQuerySchema>;

export const EmailSchema = z.string().email().max(255).transform((v) => v.toLowerCase().trim());

export const PhoneSchema = z
  .string()
  .regex(/^[+0-9][0-9\s-]{6,17}$/, "Invalid phone number")
  .optional();

export const UUIDishSchema = z.string().min(1).max(60);

export const ImageUrlSchema = z.string().url();

export const BaseStatusSchema = z.enum(["active", "inactive"]);

export const DateRangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;
