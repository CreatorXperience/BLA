import { z } from "zod";
import { Gender, MediaType, ProductStatus } from "@prisma/client";
import { CursorQuerySchema } from "@/shared/dto";

export const ProductImageSchema = z.object({
  id: z.string().optional(), // present when updating
  url: z.string().url(),
  thumbUrl: z.string().url().optional(),
  zoomUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  altText: z.string().trim().max(300).optional(),
  kind: z.nativeEnum(MediaType).default(MediaType.GALLERY),
  isThumbnail: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const ProductVariantSchema = z
  .object({
    id: z.string().optional(), // present when updating
    sku: z.string().trim().min(1).optional(),
    barcode: z.string().trim().optional(),
    color: z.string().trim().max(50).optional(),
    size: z.string().trim().max(20).optional(),
    price: z.coerce.number().positive(),
    compareAtPrice: z.coerce.number().positive().optional(),
    costPrice: z.coerce.number().positive().optional(),
    weightKg: z.coerce.number().min(0).default(0),
    isDefault: z.boolean().default(false),
    imageUrl: z.string().url().optional(),
    isActive: z.boolean().default(true),
    inventory: z
      .object({
        quantity: z.number().int().min(0).default(0),
        lowStockThreshold: z.number().int().min(0).default(5),
        allowBackorder: z.boolean().default(false),
      })
      .optional(),
  })
  .strict();

export const ProductCategoryLinkSchema = z.object({
  categoryId: z.string().min(1),
});

export const ProductCollectionLinkSchema = z.object({
  collectionId: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
});

export const SeoSchema = z.object({
  metaTitle: z.string().trim().max(70).optional(),
  metaDescription: z.string().trim().max(200).optional(),
  metaKeywords: z.string().trim().max(300).optional(),
});

export const CreateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    shortDescription: z.string().trim().max(500).optional(),
    longDescription: z.string().trim().optional(),
    materials: z.string().trim().optional(),
    careInstructions: z.string().trim().optional(),
    fit: z.string().trim().optional(),
    brand: z.string().trim().max(100).optional(),
    gender: z.nativeEnum(Gender).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
    sku: z.string().trim().min(1).optional(),
    barcode: z.string().trim().optional(),
    weightKg: z.coerce.number().min(0).default(0),
    lengthCm: z.coerce.number().min(0).optional(),
    widthCm: z.coerce.number().min(0).optional(),
    heightCm: z.coerce.number().min(0).optional(),

    ...SeoSchema.shape,

    status: z.nativeEnum(ProductStatus).default(ProductStatus.DRAFT),
    publishAt: z.string().datetime().optional().nullable(),

    basePrice: z.coerce.number().positive(),
    compareAtPrice: z.coerce.number().positive().optional(),
    costPrice: z.coerce.number().positive().optional(),
    currency: z.string().length(3).default("NGN"),

    isFeatured: z.boolean().default(false),
    isBestSeller: z.boolean().default(false),
    isTrending: z.boolean().default(false),
    isNewArrival: z.boolean().default(false),
    isLimitedEdition: z.boolean().default(false),

    images: z.array(ProductImageSchema).max(100).default([]),
    variants: z.array(ProductVariantSchema).min(1, "At least one variant is required").max(500),
    categoryIds: z.array(z.string().min(1)).optional(),
    collectionIds: z.array(ProductCollectionLinkSchema).optional(),
  })
  .strict();

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial().extend({
  status: z.nativeEnum(ProductStatus).optional(),
});

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const ProductFlagsSchema = z
  .object({
    isFeatured: z.boolean().optional(),
    isBestSeller: z.boolean().optional(),
    isTrending: z.boolean().optional(),
    isNewArrival: z.boolean().optional(),
    isLimitedEdition: z.boolean().optional(),
  })
  .strict();

export type ProductFlagsInput = z.infer<typeof ProductFlagsSchema>;

export const DuplicateProductSchema = z.object({}).strict();

export const PublishProductSchema = z
  .object({
    publishAt: z.string().datetime().optional().nullable(),
  })
  .strict();

export type PublishProductInput = z.infer<typeof PublishProductSchema>;

export const PublicProductQuerySchema = CursorQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  category: z.string().optional(),
  collection: z.string().optional(),
  brand: z.string().optional(),
  gender: z.nativeEnum(Gender).optional(),
  tag: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  inStock: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  sort: z
    .enum(["newest", "best-selling", "highest-rated", "price-asc", "price-desc", "trending", "featured"])
    .default("newest"),
});

export type PublicProductQuery = z.infer<typeof PublicProductQuerySchema>;

export const AdminProductQuerySchema = PublicProductQuerySchema.extend({
  status: z.nativeEnum(ProductStatus).optional(),
  archived: z.string().optional(),
});

export type AdminProductQuery = z.infer<typeof AdminProductQuerySchema>;
