import { z } from "zod";

export const CreateCollectionSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    description: z.string().trim().max(1000).optional(),
    bannerUrl: z.string().url().optional(),
    categoryId: z.string().min(1).optional().nullable(),
    metaTitle: z.string().trim().max(70).optional(),
    metaDescription: z.string().trim().max(200).optional(),
    sortOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    badge: z.string().trim().max(50).optional(),
    publishAt: z.string().datetime().optional().nullable(),
    unpublishAt: z.string().datetime().optional().nullable(),
    productIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type CreateCollectionInput = z.infer<typeof CreateCollectionSchema>;

export const UpdateCollectionSchema = CreateCollectionSchema.partial();

export type UpdateCollectionInput = z.infer<typeof UpdateCollectionSchema>;

export const CollectionQuerySchema = z.object({
  isActive: z.string().optional(),
  isFeatured: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CollectionQuery = z.infer<typeof CollectionQuerySchema>;

export const AddProductsSchema = z
  .object({
    productIds: z.array(z.string().min(1)).min(1).max(500),
  })
  .strict();

export type AddProductsInput = z.infer<typeof AddProductsSchema>;
