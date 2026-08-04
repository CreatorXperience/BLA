import { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { productRepository, type ProductWithRelations } from "../repositories/product.repository";
import { generateSKU, generateUniqueSlug } from "@/utils/id";
import { slugify } from "@/utils/slugify";
import { ConflictError, NotFoundError } from "@/shared/errors";
import { cacheDelPattern } from "@/database/redis";
import { inventoryAlertQueue } from "@/queues";
import { logger } from "@/shared/logger";
import type {
  CreateProductInput,
  ProductFlagsInput,
  PublishProductInput,
  UpdateProductInput,
  PublicProductQuery,
  AdminProductQuery,
} from "../validators";
import { mapProductDetail, mapProductSummary } from "./product.mapper";

type Tx = Prisma.TransactionClient;

const PRODUCT_CACHE_PREFIX = "cache:product*";

function cacheEvict(productId?: string) {
  return cacheDelPattern(PRODUCT_CACHE_PREFIX);
}

export class ProductService {
  // --- admin mutations ------------------------------------------------------

  async createProduct(input: CreateProductInput, actorId?: string) {
    const productSlug = input.slug ?? generateUniqueSlug(input.name);
    const productSku = input.sku ?? generateSKU();

    const existingSlug = await prisma.product.findUnique({ where: { slug: productSlug } });
    if (existingSlug) throw new ConflictError("A product with this slug already exists");
    const existingSku = await prisma.product.findUnique({ where: { sku: productSku } });
    if (existingSku) throw new ConflictError("A product with this SKU already exists");

    const status = input.status ?? ProductStatus.DRAFT;
    const publishedAt = status === ProductStatus.PUBLISHED ? new Date() : null;
    const publishAt = status === ProductStatus.SCHEDULED && input.publishAt ? new Date(input.publishAt) : null;

    const product = await prisma.product.create({
      data: {
        name: input.name,
        slug: productSlug,
        shortDescription: input.shortDescription,
        longDescription: input.longDescription,
        materials: input.materials,
        careInstructions: input.careInstructions,
        fit: input.fit,
        brand: input.brand,
        gender: input.gender,
        tags: input.tags ?? [],
        sku: productSku,
        barcode: input.barcode,
        weightKg: input.weightKg,
        lengthCm: input.lengthCm,
        widthCm: input.widthCm,
        heightCm: input.heightCm,
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
        metaKeywords: input.metaKeywords,
        status,
        publishAt,
        publishedAt,
        basePrice: input.basePrice,
        compareAtPrice: input.compareAtPrice,
        costPrice: input.costPrice,
        currency: input.currency,
        isFeatured: input.isFeatured ?? false,
        isBestSeller: input.isBestSeller ?? false,
        isTrending: input.isTrending ?? false,
        isNewArrival: input.isNewArrival ?? false,
        isLimitedEdition: input.isLimitedEdition ?? false,
        createdBy: actorId,
        images: {
          create: input.images.map((img, idx) => ({
            ...img,
            sortOrder: img.sortOrder ?? idx,
          })),
        },
        variants: {
          create: input.variants.map((v) => ({
            sku: v.sku ?? generateSKU(),
            barcode: v.barcode,
            color: v.color,
            size: v.size,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            costPrice: v.costPrice,
            weightKg: v.weightKg ?? 0,
            isDefault: v.isDefault,
            imageUrl: v.imageUrl,
            isActive: v.isActive ?? true,
            inventory: v.inventory
              ? {
                  create: {
                    quantity: v.inventory.quantity,
                    lowStockThreshold: v.inventory.lowStockThreshold,
                    allowBackorder: v.inventory.allowBackorder,
                    status: v.inventory.quantity === 0 ? "OUT_OF_STOCK" : "IN_STOCK",
                  },
                }
              : { create: { quantity: 0 } },
          })),
        },
        categories: input.categoryIds?.length
          ? { create: input.categoryIds.map((categoryId) => ({ categoryId })) }
          : undefined,
        collections: input.collectionIds?.length
          ? { create: input.collectionIds.map((c) => ({ collectionId: c.collectionId, sortOrder: c.sortOrder })) }
          : undefined,
      },
    });

    await cacheEvict();
    return this.getAdmin(product.id);
  }

  async updateProduct(id: string, input: UpdateProductInput, actorId?: string) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError("Product not found");

    const data: Prisma.ProductUpdateInput = {
      ...(input.name !== undefined && { name: input.name, slug: input.slug ?? slugify(input.name) }),
      ...(input.shortDescription !== undefined && { shortDescription: input.shortDescription }),
      ...(input.longDescription !== undefined && { longDescription: input.longDescription }),
      ...(input.materials !== undefined && { materials: input.materials }),
      ...(input.careInstructions !== undefined && { careInstructions: input.careInstructions }),
      ...(input.fit !== undefined && { fit: input.fit }),
      ...(input.brand !== undefined && { brand: input.brand }),
      ...(input.gender !== undefined && { gender: input.gender }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.sku !== undefined && { sku: input.sku }),
      ...(input.barcode !== undefined && { barcode: input.barcode }),
      ...(input.weightKg !== undefined && { weightKg: input.weightKg }),
      ...(input.lengthCm !== undefined && { lengthCm: input.lengthCm }),
      ...(input.widthCm !== undefined && { widthCm: input.widthCm }),
      ...(input.heightCm !== undefined && { heightCm: input.heightCm }),
      ...(input.metaTitle !== undefined && { metaTitle: input.metaTitle }),
      ...(input.metaDescription !== undefined && { metaDescription: input.metaDescription }),
      ...(input.metaKeywords !== undefined && { metaKeywords: input.metaKeywords }),
      ...(input.basePrice !== undefined && { basePrice: input.basePrice }),
      ...(input.compareAtPrice !== undefined && { compareAtPrice: input.compareAtPrice }),
      ...(input.costPrice !== undefined && { costPrice: input.costPrice }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.isFeatured !== undefined && { isFeatured: input.isFeatured }),
      ...(input.isBestSeller !== undefined && { isBestSeller: input.isBestSeller }),
      ...(input.isTrending !== undefined && { isTrending: input.isTrending }),
      ...(input.isNewArrival !== undefined && { isNewArrival: input.isNewArrival }),
      ...(input.isLimitedEdition !== undefined && { isLimitedEdition: input.isLimitedEdition }),
      updatedBy: actorId,
    };

    if (input.status) {
      const status = input.status;
      data.status = status;
      if (status === ProductStatus.PUBLISHED) {
        data.publishedAt = existing.publishedAt ?? new Date();
        data.publishAt = null;
      } else if (status === ProductStatus.SCHEDULED && input.publishAt) {
        data.publishAt = new Date(input.publishAt);
        data.status = status;
      } else {
        data.publishAt = input.publishAt ? new Date(input.publishAt) : data.publishAt;
      }
    } else if (input.publishAt !== undefined) {
      data.publishAt = input.publishAt ? new Date(input.publishAt) : null;
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data });

      if (input.images !== undefined) {
        await this.syncImages(tx, id, existing, input.images);
      }
      if (input.variants !== undefined) {
        await this.syncVariants(tx, id, existing, input.variants, actorId);
      }
      if (input.categoryIds !== undefined) {
        await tx.productCategory.deleteMany({ where: { productId: id } });
        if (input.categoryIds.length) {
          await tx.productCategory.createMany({
            data: input.categoryIds.map((categoryId) => ({ productId: id, categoryId })),
          });
        }
      }
      if (input.collectionIds !== undefined) {
        await tx.collectionProduct.deleteMany({ where: { productId: id } });
        if (input.collectionIds.length) {
          await tx.collectionProduct.createMany({
            data: input.collectionIds.map((c) => ({ productId: id, collectionId: c.collectionId, sortOrder: c.sortOrder })),
          });
        }
      }
    });

    await cacheEvict();
    return this.getAdmin(id);
  }

  private async syncImages(
    tx: Tx,
    productId: string,
    existing: ProductWithRelations,
    images: CreateProductInput["images"],
  ) {
    const providedIds = images.filter((i) => i.id).map((i) => i.id as string);
    const existingIds = existing.images.map((i) => i.id);

    // delete removed images
    const toDelete = existingIds.filter((id) => !providedIds.includes(id));
    if (toDelete.length) {
      await tx.productImage.deleteMany({ where: { id: { in: toDelete } } });
    }

    for (const img of images) {
      const payload = {
        url: img.url,
        thumbUrl: img.thumbUrl,
        zoomUrl: img.zoomUrl,
        videoUrl: img.videoUrl,
        altText: img.altText,
        kind: img.kind,
        isThumbnail: img.isThumbnail,
        sortOrder: img.sortOrder,
        width: img.width,
        height: img.height,
      };
      if (img.id) {
        await tx.productImage.update({ where: { id: img.id }, data: payload });
      } else {
        await tx.productImage.create({ data: { productId, ...payload } });
      }
    }
  }

  private async syncVariants(
    tx: Tx,
    productId: string,
    existing: ProductWithRelations,
    variants: CreateProductInput["variants"],
    actorId?: string,
  ) {
    const providedIds = variants.filter((v) => v.id).map((v) => v.id as string);
    const existingVariants = existing.variants;

    for (const v of existingVariants) {
      if (!providedIds.includes(v.id)) {
        const referenced = await tx.orderItem.count({ where: { variantId: v.id } });
        const inCarts = await tx.cartItem.count({ where: { variantId: v.id } });
        if (referenced > 0) {
          // deactivate instead of delete to preserve order history integrity
          await tx.productVariant.update({ where: { id: v.id }, data: { isActive: false } });
        } else {
          await tx.productVariant.delete({ where: { id: v.id } });
        }
      }
    }

    for (const v of variants) {
      const base = {
        sku: v.sku ?? generateSKU(),
        barcode: v.barcode,
        color: v.color,
        size: v.size,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        costPrice: v.costPrice,
        weightKg: v.weightKg ?? 0,
        isDefault: v.isDefault,
        imageUrl: v.imageUrl,
        isActive: v.isActive ?? true,
      };
      if (v.id) {
        await tx.productVariant.update({ where: { id: v.id }, data: base });
        if (v.inventory) {
          await tx.inventory.upsert({
            where: { variantId: v.id },
            update: {
              quantity: v.inventory.quantity,
              lowStockThreshold: v.inventory.lowStockThreshold,
              allowBackorder: v.inventory.allowBackorder,
              status: v.inventory.quantity === 0 ? "OUT_OF_STOCK" : "IN_STOCK",
            },
            create: {
              variantId: v.id,
              quantity: v.inventory.quantity,
              lowStockThreshold: v.inventory.lowStockThreshold,
              allowBackorder: v.inventory.allowBackorder,
              status: v.inventory.quantity === 0 ? "OUT_OF_STOCK" : "IN_STOCK",
            },
          });
        }
      } else {
        await tx.productVariant.create({
          data: {
            productId,
            ...base,
            inventory: {
              create: {
                quantity: v.inventory?.quantity ?? 0,
                lowStockThreshold: v.inventory?.lowStockThreshold ?? 5,
                allowBackorder: v.inventory?.allowBackorder ?? false,
                status: (v.inventory?.quantity ?? 0) === 0 ? "OUT_OF_STOCK" : "IN_STOCK",
              },
            },
          },
        });
      }
    }
  }

  async toggleFlags(id: string, flags: ProductFlagsInput, actorId?: string) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError("Product not found");
    await prisma.product.update({
      where: { id },
      data: { ...flags, updatedBy: actorId },
    });
    await cacheEvict();
    return this.getAdmin(id);
  }

  async schedulePublishing(id: string, input: PublishProductInput, actorId?: string) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError("Product not found");
    const product = await prisma.product.update({
      where: { id },
      data: {
        status: ProductStatus.SCHEDULED,
        publishAt: input.publishAt ? new Date(input.publishAt) : null,
        updatedBy: actorId,
      },
    });
    await cacheEvict();
    return product;
  }

  /** Called by the scheduler worker: publish every product whose time has come. */
  async publishDueScheduled(): Promise<number> {
    const now = new Date();
    const result = await prisma.product.updateMany({
      where: {
        status: ProductStatus.SCHEDULED,
        publishAt: { lte: now, not: null },
        deletedAt: null,
      },
      data: { status: ProductStatus.PUBLISHED, publishedAt: now, publishAt: null },
    });
    if (result.count > 0) {
      await cacheEvict();
    }
    return result.count;
  }

  async archiveProduct(id: string, actorId?: string) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError("Product not found");
    await productRepository.archive(id, actorId);
    await cacheEvict();
    return { id };
  }

  async restoreProduct(id: string, actorId?: string) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError("Product not found");
    await prisma.product.update({
      where: { id },
      data: { status: ProductStatus.DRAFT, archivedAt: null, updatedBy: actorId },
    });
    await cacheEvict();
    return { id };
  }

  async deleteProduct(id: string, actorId?: string) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError("Product not found");
    await productRepository.softDelete(id, actorId);
    await cacheEvict();
    return { id };
  }

  async duplicateProduct(id: string, actorId?: string) {
    const source = await productRepository.findById(id);
    if (!source) throw new NotFoundError("Product not found");

    const newSlug = generateUniqueSlug(`${source.name} copy`);
    const product = await prisma.product.create({
      data: {
        name: `${source.name} (Copy)`,
        slug: newSlug,
        shortDescription: source.shortDescription,
        longDescription: source.longDescription,
        materials: source.materials,
        careInstructions: source.careInstructions,
        fit: source.fit,
        brand: source.brand,
        gender: source.gender,
        tags: source.tags,
        sku: generateSKU(),
        barcode: source.barcode,
        weightKg: source.weightKg,
        lengthCm: source.lengthCm,
        widthCm: source.widthCm,
        heightCm: source.heightCm,
        metaTitle: source.metaTitle,
        metaDescription: source.metaDescription,
        metaKeywords: source.metaKeywords,
        status: ProductStatus.DRAFT,
        basePrice: source.basePrice,
        compareAtPrice: source.compareAtPrice,
        costPrice: source.costPrice,
        currency: source.currency,
        createdBy: actorId,
        images: { create: source.images.map((img) => ({ ...img, id: undefined })) },
        variants: {
          create: source.variants.map((v) => ({
            sku: generateSKU(),
            barcode: v.barcode,
            color: v.color,
            size: v.size,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            costPrice: v.costPrice,
            weightKg: v.weightKg,
            isDefault: v.isDefault,
            imageUrl: v.imageUrl,
            isActive: v.isActive,
            inventory: {
              create: {
                quantity: 0,
                lowStockThreshold: v.inventory?.lowStockThreshold ?? 5,
                allowBackorder: v.inventory?.allowBackorder ?? false,
              },
            },
          })),
        },
        categories: { create: source.categories.map((pc) => ({ categoryId: pc.categoryId })) },
        collections: { create: source.collections.map((pc) => ({ collectionId: pc.collectionId, sortOrder: pc.sortOrder })) },
      },
    });

    await cacheEvict();
    return this.getAdmin(product.id);
  }

  // --- reads ----------------------------------------------------------------

  async listPublic(query: PublicProductQuery) {
    const result = await productRepository.listPublic(query);
    return { data: result.data.map((p) => this.mapShort(p)), total: result.total, nextCursor: result.nextCursor };
  }

  async listAdmin(query: AdminProductQuery) {
    const result = await productRepository.listAdmin(query);
    return { data: result.data.map((p) => this.mapDetail(p)), total: result.total, nextCursor: result.nextCursor };
  }

  async getPublic(slug: string, userId?: string) {
    const product = await productRepository.findBySlug(slug, ProductStatus.PUBLISHED);
    if (!product) throw new NotFoundError("Product not found");
    await productRepository.incrementViews(product.id).catch((e) => logger.debug({ e }, "view increment skipped"));
    const detail = this.mapDetail(product);
    if (userId) {
      const wishlisted = await prisma.wishlistItem.findUnique({
        where: { userId_productId: { userId, productId: product.id } },
      });
      return { ...detail, wishlisted: !!wishlisted };
    }
    return detail;
  }

  async getAdmin(id: string) {
    const product = await productRepository.findById(id);
    if (!product) throw new NotFoundError("Product not found");
    return this.mapDetail(product);
  }

  async related(productId: string, limit = 6) {
    const product = await productRepository.findById(productId);
    if (!product) return [];
    const categoryIds = product.categories.map((pc) => pc.categoryId);
    const related = await productRepository.related(productId, categoryIds, limit);
    return related.map((p) => this.mapShort(p));
  }

  async recentlyViewed(productIds: string[], excludeId?: string, limit = 6) {
    const ids = productIds.filter((id) => id !== excludeId).slice(0, 20);
    if (ids.length === 0) return [];
    const products = await productRepository.byIds(ids);
    return products.slice(0, limit).map((p) => this.mapShort(p));
  }

  async recommended(userId: string | undefined, limit = 8) {
    let based: ProductWithRelations[] = [];
    if (userId) {
      const recent = await prisma.wishlistItem.findMany({
        where: { userId },
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { product: { include: { categories: { select: { categoryId: true } } } } },
      });
      const categoryIds = recent.flatMap((r) => r.product.categories.map((c) => c.categoryId));
      if (categoryIds.length) {
        based = await productRepository.related("__none__", categoryIds, limit);
      }
    }
    if (based.length === 0) {
      based = await productRepository.recommended(limit);
    }
    return based.map((p) => this.mapShort(p));
  }

  async byFlags(flags: Parameters<typeof productRepository.byFlags>[0], limit = 8) {
    const products = await productRepository.byFlags(flags, limit);
    return products.map((p) => this.mapShort(p));
  }

  async stats() {
    const [total, byStatus, lowStock] = await Promise.all([
      prisma.product.count({ where: { deletedAt: null } }),
      productRepository.countByStatus(),
      prisma.lowStockAlert.count({ where: { resolved: false } }),
    ]);
    const map: Record<string, number> = {};
    for (const row of byStatus) map[row.status] = row._count._all;
    return { total, byStatus: map, openLowStockAlerts: lowStock };
  }

  private mapShort(p: ProductWithRelations) {
    return mapProductSummary(p);
  }

  private mapDetail(p: ProductWithRelations) {
    return mapProductDetail(p);
  }
}

export const productService = new ProductService();
export type { ProductWithRelations };
