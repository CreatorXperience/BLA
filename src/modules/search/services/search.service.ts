import { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { redis } from "@/database/redis";
import { logger } from "@/shared/logger";
import { cached, cacheKey } from "@/database/redis";
import type { AutocompleteQueryInput, SearchQueryInput } from "../validators";

const TRENDING_KEY = "search:trending";
const RECENT_PREFIX = "search:recent:";
const RECENT_MAX = 10;
const TRENDING_MAX = 20;

export class SearchRepository {
  async searchProducts(q: string, limit: number) {
    const term = q.trim();
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.PUBLISHED,
      deletedAt: null,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { brand: { contains: term, mode: "insensitive" } },
        { shortDescription: { contains: term, mode: "insensitive" } },
        { tags: { has: term } },
        { sku: { equals: term, mode: "insensitive" } },
        { variants: { some: { sku: { equals: term, mode: "insensitive" } } } },
      ],
    };

    return prisma.product.findMany({
      where,
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        variants: { include: { inventory: true }, take: 1 },
      },
      take: limit,
      orderBy: [{ totalSold: "desc" }, { rating: "desc" }],
    });
  }

  async searchCategories(q: string, limit: number) {
    return prisma.category.findMany({
      where: {
        isActive: true,
        OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }],
      },
      take: limit,
    });
  }

  async searchCollections(q: string, limit: number) {
    return prisma.collection.findMany({
      where: {
        isActive: true,
        OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }],
      },
      take: limit,
    });
  }

  async countProducts(q: string): Promise<number> {
    const term = q.trim();
    return prisma.product.count({
      where: {
        status: ProductStatus.PUBLISHED,
        deletedAt: null,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { brand: { contains: term, mode: "insensitive" } },
          { tags: { has: term } },
        ],
      },
    });
  }

  // --- trending / recent ----------------------------------------------------

  async recordSearch(params: { query: string; userId?: string; ipAddress?: string }) {
    const term = params.query.trim().toLowerCase().slice(0, 60);
    if (!term) return;
    try {
      await redis.zincrby(TRENDING_KEY, 1, term);
      await redis.zremrangebyrank(TRENDING_KEY, 0, -(TRENDING_MAX + 1));
      await redis.expire(TRENDING_KEY, 60 * 60 * 24 * 30);

      if (params.userId) {
        const recentKey = `${RECENT_PREFIX}${params.userId}`;
        await redis.lrem(recentKey, 0, term);
        await redis.lpush(recentKey, term);
        await redis.ltrim(recentKey, 0, RECENT_MAX - 1);
        await redis.expire(recentKey, 60 * 60 * 24 * 30);
      }
    } catch (error) {
      logger.warn({ error }, "failed to record search");
    }
  }

  async trending(limit = 10): Promise<string[]> {
    try {
      const rows = await redis.zrevrange(TRENDING_KEY, 0, limit - 1);
      return rows;
    } catch {
      return [];
    }
  }

  async recent(userId: string): Promise<string[]> {
    try {
      return await redis.lrange(`${RECENT_PREFIX}${userId}`, 0, RECENT_MAX - 1);
    } catch {
      return [];
    }
  }

  async clearRecent(userId: string) {
    await redis.del(`${RECENT_PREFIX}${userId}`);
  }
}

export const searchRepository = new SearchRepository();

export class SearchService {
  async search(input: SearchQueryInput, ctx?: { userId?: string; ipAddress?: string }) {
    const result = await searchRepository.searchProducts(input.q, input.limit);
    const [categories, collections, total] = await Promise.all([
      searchRepository.searchCategories(input.q, 5),
      searchRepository.searchCollections(input.q, 5),
      searchRepository.countProducts(input.q),
    ]);

    await searchRepository.recordSearch({
      query: input.q,
      userId: ctx?.userId,
      ipAddress: ctx?.ipAddress,
    });
    await prisma.searchQuery.create({
      data: {
        query: input.q,
        userId: ctx?.userId,
        results: total,
        ipAddress: ctx?.ipAddress,
      },
    }).catch(() => undefined);

    return {
      products: result.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        brand: p.brand,
        thumbnail: p.images[0]?.url ?? null,
        basePrice: p.basePrice.toString(),
        compareAtPrice: p.compareAtPrice?.toString() ?? null,
        currency: p.currency,
        inStock: p.variants.some((v) => (v.inventory?.quantity ?? 0) > 0),
      })),
      categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
      collections: collections.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
      total,
    };
  }

  async autocomplete(input: AutocompleteQueryInput): Promise<Array<{ type: string; label: string; slug?: string; id?: string }>> {
    const q = input.q.toLowerCase().trim();
    const cachedResult = await cached(
      cacheKey("search", "autocomplete", q),
      async () => {
        const [products, categories, collections] = await Promise.all([
          prisma.product.findMany({
            where: {
              status: ProductStatus.PUBLISHED,
              deletedAt: null,
              name: { contains: q, mode: "insensitive" },
            },
            select: { id: true, name: true, slug: true },
            take: 5,
            orderBy: { totalSold: "desc" },
          }),
          prisma.category.findMany({
            where: { isActive: true, name: { contains: q, mode: "insensitive" } },
            select: { id: true, name: true, slug: true },
            take: 3,
          }),
          prisma.collection.findMany({
            where: { isActive: true, name: { contains: q, mode: "insensitive" } },
            select: { id: true, name: true, slug: true },
            take: 3,
          }),
        ]);

        return [
          ...products.map((p) => ({ type: "product", label: p.name, slug: p.slug, id: p.id })),
          ...categories.map((c) => ({ type: "category", label: c.name, slug: c.slug, id: c.id })),
          ...collections.map((c) => ({ type: "collection", label: c.name, slug: c.slug, id: c.id })),
        ].slice(0, input.limit);
      },
      600,
    );
    return cachedResult;
  }

  trending(limit = 10) {
    return searchRepository.trending(limit);
  }

  recent(userId: string) {
    return searchRepository.recent(userId);
  }

  async clearRecent(userId: string) {
    await searchRepository.clearRecent(userId);
  }
}

export const searchService = new SearchService();
