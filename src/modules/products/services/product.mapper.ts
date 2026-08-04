import type { ProductWithRelations } from "../repositories/product.repository";
import { toNumber } from "@/utils/money";

function totalStock(product: ProductWithRelations): number {
  return product.variants.reduce((acc, v) => acc + (v.inventory?.quantity ?? 0), 0);
}

function availableStock(product: ProductWithRelations): number {
  return product.variants.reduce(
    (acc, v) => acc + ((v.inventory?.quantity ?? 0) - (v.inventory?.reserved ?? 0)),
    0,
  );
}

function thumbnail(product: ProductWithRelations): string | null {
  const thumb = product.images.find((i) => i.isThumbnail) ?? product.images[0];
  return thumb?.url ?? null;
}

function priceRange(product: ProductWithRelations): { min: number; max: number } {
  const prices = product.variants.map((v) => toNumber(v.price));
  if (prices.length === 0) return { min: toNumber(product.basePrice), max: toNumber(product.basePrice) };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function mapProductSummary(product: ProductWithRelations) {
  const { min, max } = priceRange(product);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    gender: product.gender,
    basePrice: product.basePrice.toString(),
    compareAtPrice: product.compareAtPrice?.toString() ?? null,
    currency: product.currency,
    rating: product.rating.toString(),
    reviewCount: product.reviewCount,
    totalSold: product.totalSold,
    status: product.status,
    isFeatured: product.isFeatured,
    isBestSeller: product.isBestSeller,
    isTrending: product.isTrending,
    isNewArrival: product.isNewArrival,
    isLimitedEdition: product.isLimitedEdition,
    thumbnail,
    minVariantPrice: min.toFixed(2),
    maxVariantPrice: max.toFixed(2),
    totalStock: totalStock(product),
    inStock: availableStock(product) > 0,
  };
}

export function mapProductDetail(product: ProductWithRelations) {
  const availableSizes = Array.from(
    new Set(product.variants.map((v) => v.size).filter((s): s is string => !!s)),
  ).sort();
  const availableColors = Array.from(
    new Set(product.variants.map((v) => v.color).filter((c): c is string => !!c)),
  );

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription,
    longDescription: product.longDescription,
    brand: product.brand,
    gender: product.gender,
    materials: product.materials,
    careInstructions: product.careInstructions,
    fit: product.fit,
    tags: product.tags,
    sku: product.sku,
    status: product.status,
    basePrice: product.basePrice.toString(),
    compareAtPrice: product.compareAtPrice?.toString() ?? null,
    currency: product.currency,
    rating: product.rating.toString(),
    reviewCount: product.reviewCount,
    isFeatured: product.isFeatured,
    isBestSeller: product.isBestSeller,
    isTrending: product.isTrending,
    isNewArrival: product.isNewArrival,
    isLimitedEdition: product.isLimitedEdition,
    categories: product.categories.map((pc) => ({
      id: pc.category.id,
      name: pc.category.name,
      slug: pc.category.slug,
    })),
    collections: product.collections.map((pc) => ({
      id: pc.collection.id,
      name: pc.collection.name,
      slug: pc.collection.slug,
    })),
    images: product.images.map((img) => ({
      id: img.id,
      url: img.url,
      thumbUrl: img.thumbUrl,
      zoomUrl: img.zoomUrl,
      videoUrl: img.videoUrl,
      altText: img.altText,
      kind: img.kind,
      isThumbnail: img.isThumbnail,
      sortOrder: img.sortOrder,
    })),
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      color: v.color,
      size: v.size,
      price: v.price.toString(),
      compareAtPrice: v.compareAtPrice?.toString() ?? null,
      imageUrl: v.imageUrl,
      isActive: v.isActive,
      isDefault: v.isDefault,
      inventory: v.inventory
        ? {
            quantity: v.inventory.quantity,
            reserved: v.inventory.reserved,
            available: v.inventory.quantity - v.inventory.reserved,
            status: v.inventory.status,
          }
        : null,
    })),
    availableSizes,
    availableColors,
    totalStock: totalStock(product),
    inStock: availableStock(product) > 0,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    metaKeywords: product.metaKeywords,
    publishedAt: product.publishedAt,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
