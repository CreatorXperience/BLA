import type { Gender, ProductStatus } from "@prisma/client";

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  gender: Gender | null;
  basePrice: string;
  compareAtPrice: string | null;
  currency: string;
  rating: string;
  reviewCount: number;
  totalSold: number;
  status: ProductStatus;
  isFeatured: boolean;
  isBestSeller: boolean;
  isTrending: boolean;
  isNewArrival: boolean;
  isLimitedEdition: boolean;
  thumbnail: string | null;
  minVariantPrice: string;
  maxVariantPrice: string;
  totalStock: number;
  inStock: boolean;
}

export interface ProductResponse {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  longDescription: string | null;
  brand: string | null;
  gender: Gender | null;
  materials: string | null;
  careInstructions: string | null;
  fit: string | null;
  tags: string[];
  sku: string;
  status: ProductStatus;
  basePrice: string;
  compareAtPrice: string | null;
  currency: string;
  rating: string;
  reviewCount: number;
  isFeatured: boolean;
  isBestSeller: boolean;
  isTrending: boolean;
  isNewArrival: boolean;
  isLimitedEdition: boolean;
  categories: Array<{ id: string; name: string; slug: string }>;
  collections: Array<{ id: string; name: string; slug: string }>;
  images: Array<{
    id: string;
    url: string;
    thumbUrl: string | null;
    zoomUrl: string | null;
    videoUrl: string | null;
    altText: string | null;
    kind: string;
    isThumbnail: boolean;
    sortOrder: number;
  }>;
  variants: Array<{
    id: string;
    sku: string;
    color: string | null;
    size: string | null;
    price: string;
    compareAtPrice: string | null;
    imageUrl: string | null;
    isActive: boolean;
    isDefault: boolean;
    inventory: { quantity: number; reserved: number; available: number; status: string } | null;
  }>;
  availableSizes: string[];
  availableColors: string[];
  totalStock: number;
  inStock: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RelatedProductsInput {
  productId: string;
  limit?: number;
}

export interface RecentlyViewedInput {
  productIds: string[];
  limit?: number;
  excludeId?: string;
}

export interface RecommendationInput {
  userId?: string;
  limit?: number;
  excludeId?: string;
}
