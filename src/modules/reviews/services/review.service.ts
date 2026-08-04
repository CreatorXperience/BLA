import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors";
import { reviewRepository } from "../repositories/review.repository";
import { cacheDelPattern } from "@/database/redis";
import type { AdminReviewQuery, CreateReviewInput, ModerateReviewInput, ReviewQuery } from "../validators";

export class ReviewService {
  listForProduct(productId: string, query: ReviewQuery) {
    return reviewRepository.listForProduct(productId, query);
  }

  async create(userId: string, input: CreateReviewInput) {
    const purchased = await reviewRepository.hasPurchased(userId, input.productId);
    if (!purchased) {
      throw new ForbiddenError("Only customers who purchased this product can review it");
    }
    if (await reviewRepository.hasReviewed(userId, input.productId)) {
      throw new ConflictError("You have already reviewed this product");
    }

    const review = await reviewRepository.create({
      product: { connect: { id: input.productId } },
      user: { connect: { id: userId } },
      rating: input.rating,
      title: input.title,
      body: input.body,
      images: input.images ?? [],
      isVerified: purchased,
      status: "PENDING",
    });

    return review;
  }

  async moderate(reviewId: string, input: ModerateReviewInput) {
    const review = await reviewRepository.findById(reviewId);
    if (!review) throw new NotFoundError("Review not found");
    const updated = await reviewRepository.update(reviewId, { status: input.status });
    await reviewRepository.syncProductRating(review.productId);
    await cacheDelPattern("cache:product*");
    return updated;
  }

  async like(reviewId: string, userId: string) {
    const review = await reviewRepository.findById(reviewId);
    if (!review) throw new NotFoundError("Review not found");
    return reviewRepository.toggleLike(reviewId, userId);
  }

  async report(reviewId: string, userId: string, reason: string) {
    const review = await reviewRepository.findById(reviewId);
    if (!review) throw new NotFoundError("Review not found");
    return reviewRepository.report(reviewId, userId, reason);
  }

  async listAdmin(query: AdminReviewQuery) {
    return reviewRepository.listAdmin(query);
  }

  async stats() {
    const { prisma } = await import("@/database/prisma");
    const [pending, approved, rejected, spam, total] = await Promise.all([
      prisma.review.count({ where: { status: "PENDING" } }),
      prisma.review.count({ where: { status: "APPROVED" } }),
      prisma.review.count({ where: { status: "REJECTED" } }),
      prisma.review.count({ where: { status: "SPAM" } }),
      prisma.review.count(),
    ]);
    return { pending, approved, rejected, spam, total };
  }
}

export const reviewService = new ReviewService();
