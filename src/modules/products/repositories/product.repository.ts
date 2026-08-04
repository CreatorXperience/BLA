import { Prisma, ProductStatus, PrismaClient } from "@prisma/client";
import { prisma } from "@/database/prisma";
import type { AdminProductQuery, PublicProductQuery } from "../validators";

export const productInclude = {
  images: { orderBy: { sortOrder: "asc" as const } },
  variants: {
    where: { isActive: true },
    include: { inventory: true },
    orderBy: [{ isDefault: "desc" as const }, { color: "asc" as const }, { size: "asc" as const }],
  },
  categories: { include: { category: true } },
  collections: { include: { collection: true } },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export interface ProductListResult {
  data: ProductWithRelations[];
  total: number;
  nextCursor: string | null;
}

export class ProductRepository {
  findById(id: string, includeInactive = true) {
    return prisma.product.findUnique({
      where: { id },
      include: {
        ...productInclude,
        variants: includeInactive
          ? { include: { inventory: true }, orderBy: [{ isDefault: "desc" }, { color: "asc" }, { size: "asc" }] }
          : productInclude.variants,
      },
    });
  }

  findBySlug(slug: string, status?: ProductStatus) {
    return prisma.product.findFirst({
      where: { slug, ...(status ? { status } : {}), deletedAt: null },
      include: productInclude,
    });
  }

  findBySku(sku: string) {
    return prisma.product.findUnique({ where: { sku } });
  }

  create(data: Prisma.ProductCreateInput) {
    return prisma.product.create({ data });
  }

  update(id: string, data: Prisma.ProductUpdateInput) {
    return prisma.product.update({ where: { id }, data });
  }

  updateBySlug(slug: string, data: Prisma.ProductUpdateInput) {
    return prisma.product.update({ where: { slug }, data });
  }

  softDelete(id: string, updatedBy?: string) {
    return prisma.product.update({
      where: { id },
      data: { status: ProductStatus.DELETED, deletedAt: new Date(), updatedBy },
    });
  }

  archive(id: string, updatedBy?: string) {
    return prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ARCHIVED, archivedAt: new Date(), updatedBy },
    });
  }

  countByStatus() {
    return prisma.product.groupBy({ by: ["status"], _count: { _all: true } });
  }

  async listPublic(query: PublicProductQuery): Promise<ProductListResult> {
    const where = this.publicWhere(query);
    const [total, data] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: productInclude,
        take: query.limit,
        orderBy: this.sortToOrderBy(query.sort),
      }),
    ]);
    return { data, total, nextCursor: null };
  }

  async listAdmin(query: AdminProductQuery): Promise<ProductListResult> {
    const where = this.adminWhere(query);
    const [total, data] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: productInclude,
        take: query.limit,
        orderBy: this.sortToOrderBy(query.sort),
      }),
    ]);
    return { data, total, nextCursor: null };
  }

  // --- public filter builder ------------------------------------------------

  private publicWhere(q: PublicProductQuery): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.PUBLISHED,
      deletedAt: null,
      AND: [{ OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] }],
    };

    if (q.q) {
      const term = q.q.trim();
      const contains = { contains: term, mode: "insensitive" as const };
      where.OR = [
        { name: contains },
        { brand: contains },
        { shortDescription: contains },
        { tags: { has: term } },
        { sku: { equals: term, mode: "insensitive" } },
        { variants: { some: { sku: { equals: term, mode: "insensitive" } } } },
      ];
    }
    if (q.category) {
      where.categories = { some: { category: { slug: q.category } } };
    }
    if (q.collection) {
      where.collections = { some: { collection: { slug: q.collection } } };
    }
    if (q.brand) {
      where.brand = { equals: q.brand, mode: "insensitive" };
    }
    if (q.gender) {
      where.gender = q.gender;
    }
    if (q.tag) {
      where.tags = { has: q.tag };
    }
    if (q.color) {
      where.variants = { some: { color: { equals: q.color, mode: "insensitive" } } };
    }
    if (q.size) {
      where.variants = {
        ...(where.variants as object | undefined),
        some: { size: { equals: q.size, mode: "insensitive" } },
      };
    }
    if (q.minPrice !== undefined || q.maxPrice !== undefined) {
      where.variants = {
        ...(where.variants as object | undefined),
        some: {
          price: {
            ...(q.minPrice !== undefined ? { gte: q.minPrice } : {}),
            ...(q.maxPrice !== undefined ? { lte: q.maxPrice } : {}),
          },
        },
      };
    }
    if (q.inStock === true) {
      where.variants = {
        ...(where.variants as object | undefined),
        some: { isActive: true, inventory: { quantity: { gt: 0 } } },
      };
    }

    return where;
  }

  private adminWhere(q: AdminProductQuery): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.archived === "true" ? { archivedAt: { not: null } } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: "insensitive" as const } },
              { sku: { contains: q.q, mode: "insensitive" as const } },
              { brand: { contains: q.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    return where;
  }

  private sortToOrderBy(sort: string): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case "newest":
        return [{ publishedAt: "desc" }];
      case "price-asc":
        return [{ basePrice: "asc" }];
      case "price-desc":
        return [{ basePrice: "desc" }];
      case "best-selling":
        return [{ totalSold: "desc" }];
      case "highest-rated":
        return [{ rating: "desc" }, { reviewCount: "desc" }];
      case "trending":
        return [{ isTrending: "desc" }, { totalSold: "desc" }];
      case "featured":
        return [{ isFeatured: "desc" }, { publishedAt: "desc" }];
      default:
        return [{ publishedAt: "desc" }];
    }
  }

  // --- recommendation helpers ----------------------------------------------

  async related(productId: string, categoryIds: string[], limit = 6): Promise<ProductWithRelations[]> {
    if (categoryIds.length === 0) return [];
    return prisma.product.findMany({
      where: {
        id: { not: productId },
        status: ProductStatus.PUBLISHED,
        deletedAt: null,
        categories: { some: { categoryId: { in: categoryIds } } },
      },
      include: productInclude,
      take: limit,
      orderBy: [{ totalSold: "desc" }, { rating: "desc" }],
    });
  }

  async byIds(ids: string[]): Promise<ProductWithRelations[]> {
    if (ids.length === 0) return [];
    return prisma.product.findMany({
      where: { id: { in: ids }, status: ProductStatus.PUBLISHED, deletedAt: null },
      include: productInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async recommended(limit = 8): Promise<ProductWithRelations[]> {
    return prisma.product.findMany({
      where: { status: ProductStatus.PUBLISHED, deletedAt: null, isTrending: true },
      include: productInclude,
      take: limit,
      orderBy: [{ totalSold: "desc" }, { rating: "desc" }],
    });
  }

  async byFlags(flags: Partial<{
    isFeatured: boolean;
    isBestSeller: boolean;
    isTrending: boolean;
    isNewArrival: boolean;
    isLimitedEdition: boolean;
  }>, limit = 8): Promise<ProductWithRelations[]> {
    return prisma.product.findMany({
      where: { status: ProductStatus.PUBLISHED, deletedAt: null, ...flags },
      include: productInclude,
      take: limit,
      orderBy: { publishedAt: "desc" },
    });
  }

  async incrementViews(id: string): Promise<void> {
    await prisma.product.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  }
}

export const productRepository = new ProductRepository();

export type PrismaTransactionalClient = Prisma.TransactionClient;
export type { PrismaClient };
