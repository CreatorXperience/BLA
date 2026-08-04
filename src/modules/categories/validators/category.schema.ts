import { z } from "zod";

export const CreateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    parentId: z.string().min(1).nullable().optional(),
    description: z.string().trim().max(500).optional(),
    imageUrl: z.string().url().optional(),
    bannerUrl: z.string().url().optional(),
    iconUrl: z.string().url().optional(),
    metaTitle: z.string().trim().max(70).optional(),
    metaDescription: z.string().trim().max(200).optional(),
    sortOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
  })
  .strict();

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = CreateCategorySchema.partial();

export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;

export const CategoryQuerySchema = z.object({
  includeChildren: z.string().optional(),
  isActive: z.string().optional(),
  isFeatured: z.string().optional(),
  parentId: z.string().optional().nullable(),
});

export type CategoryQuery = z.infer<typeof CategoryQuerySchema>;
