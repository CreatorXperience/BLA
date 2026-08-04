import { z } from "zod";

export const CreateReviewSchema = z
  .object({
    productId: z.string().min(1),
    rating: z.coerce.number().int().min(1).max(5),
    title: z.string().trim().max(200).optional(),
    body: z.string().trim().max(2000).optional(),
    images: z.array(z.string().url()).max(10).optional(),
  })
  .strict();

export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;

export const ReviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(["newest", "oldest", "highest", "lowest", "helpful"]).default("newest"),
  withPhotos: z.string().optional(),
});

export type ReviewQuery = z.infer<typeof ReviewQuerySchema>;

export const AdminReviewQuerySchema = ReviewQuerySchema.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SPAM"]).optional(),
});

export type AdminReviewQuery = z.infer<typeof AdminReviewQuerySchema>;

export const ModerateReviewSchema = z
  .object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "SPAM"]),
  })
  .strict();

export type ModerateReviewInput = z.infer<typeof ModerateReviewSchema>;

export const ReportReviewSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type ReportReviewInput = z.infer<typeof ReportReviewSchema>;
