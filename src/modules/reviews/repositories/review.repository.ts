import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import type { AdminReviewQuery, ReviewQuery } from "../validators";

export class ReviewRepository {
  async listForProduct(productId: string, query: ReviewQuery) {
    const where: Prisma.ReviewWhereInput = {
      productId,
      status: "APPROVED",
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.withPhotos === "true" ? { images: { isEmpty: false } } : {}),
    };
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
      query.sort === "oldest"
        ? [{ createdAt: "asc" }]
        : query.sort === "highest"
          ? [{ rating: "desc" }]
          : query.sort === "lowest"
            ? [{ rating: "asc" }]
            : query.sort === "helpful"
              ? [{ helpfulCount: "desc" }]
              : [{ createdAt: "desc" }];

    const [data, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        orderBy,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.review.count({ where }),
    ]);
    return { data, total, page: query.page, perPage: query.perPage };
  }

  async listAdmin(query: AdminReviewQuery) {
    const where: Prisma.ReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.rating ? { rating: query.rating } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          product: { select: { id: true, name: true, slug: true } },
          order: { select: { orderNumber: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.review.count({ where }),
    ]);
    return { data, total, page: query.page, perPage: query.perPage };
  }

  create(data: Prisma.ReviewCreateInput) {
    return prisma.review.create({ data });
  }

  update(id: string, data: Prisma.ReviewUpdateInput) {
    return prisma.review.update({ where: { id }, data });
  }

  findById(id: string) {
    return prisma.review.findUnique({ where: { id } });
  }

  async hasPurchased(userId: string, productId: string): Promise<boolean> {
    const count = await prisma.orderItem.count({
      where: { productId, order: { userId, status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] } } },
    });
    return count > 0;
  }

  async hasReviewed(userId: string, productId: string): Promise<boolean> {
    const count = await prisma.review.count({ where: { userId, productId } });
    return count > 0;
  }

  async liked(reviewId: string, userId: string): Promise<boolean> {
    const count = await prisma.reviewLike.count({ where: { reviewId, userId } });
    return count > 0;
  }

  toggleLike(reviewId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.reviewLike.findUnique({
        where: { reviewId_userId: { reviewId, userId } },
      });
      if (existing) {
        await tx.reviewLike.delete({ where: { id: existing.id } });
        await tx.review.update({ where: { id: reviewId }, data: { helpfulCount: { decrement: 1 } } });
        return { liked: false };
      }
      await tx.reviewLike.create({ data: { reviewId, userId } });
      await tx.review.update({ where: { id: reviewId }, data: { helpfulCount: { increment: 1 } } });
      return { liked: true };
    });
  }

  report(reviewId: string, userId: string, reason: string) {
    return prisma.reviewReport.upsert({
      where: { reviewId_userId: { reviewId, userId } },
      update: { reason, status: "PENDING" },
      create: { reviewId, userId, reason },
    });
  }

  async aggregateRating(productId: string) {
    const result = await prisma.review.aggregate({
      where: { productId, status: "APPROVED" },
      _avg: { rating: true },
      _count: true,
    });
    return {
      average: Number(result._avg.rating?.toFixed(2) ?? 0),
      count: result._count,
    };
  }

  async syncProductRating(productId: string) {
    const { average, count } = await this.aggregateRating(productId);
    await prisma.product.update({
      where: { id: productId },
      data: { rating: average, reviewCount: count },
    });
  }
}

export const reviewRepository = new ReviewRepository();
