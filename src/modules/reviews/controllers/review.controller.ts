import type { Context } from "hono";
import { reviewService } from "../services/review.service";
import { success, paginationMeta } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import type { CreateReviewInput, ModerateReviewInput, ReportReviewInput, ReviewQuery, AdminReviewQuery } from "../validators";

export class ReviewController {
  listForProduct = async (c: Context): Promise<Response> => {
    const productId = c.req.param("productId") ?? "";
    const query = c.req.query();
    const result = await reviewService.listForProduct(productId, query as unknown as ReviewQuery);
    return c.json(success(result.data, "Reviews", { pagination: paginationMeta(result.page, result.perPage, result.total) }));
  };

  create = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as CreateReviewInput;
    const review = await reviewService.create(user.id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "Review", entityId: review.id, c });
    return c.json(success(review, "Review submitted for moderation"), 201);
  };

  like = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const reviewId = c.req.param("id") ?? "";
    const result = await reviewService.like(reviewId, user.id);
    return c.json(success(result, "Review like toggled"));
  };

  report = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const reviewId = c.req.param("id") ?? "";
    const body = (await c.req.json()) as ReportReviewInput;
    const result = await reviewService.report(reviewId, user.id, body.reason);
    return c.json(success(result, "Review reported"));
  };

  // Admin
  listAdmin = async (c: Context): Promise<Response> => {
    const query = c.req.query();
    const result = await reviewService.listAdmin(query as unknown as AdminReviewQuery);
    return c.json(success(result.data, "Reviews", { pagination: paginationMeta(result.page, result.perPage, result.total) }));
  };

  moderate = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const reviewId = c.req.param("id") ?? "";
    const body = (await c.req.json()) as ModerateReviewInput;
    const review = await reviewService.moderate(reviewId, body);
    await recordAudit({ actorId: user.id, action: AuditAction.STATUS_CHANGE, entity: "Review", entityId: reviewId, metadata: { status: body.status }, c });
    return c.json(success(review, "Review updated"));
  };

  stats = async (c: Context): Promise<Response> => {
    return c.json(success(await reviewService.stats(), "Review stats"));
  };
}

export const reviewController = new ReviewController();
