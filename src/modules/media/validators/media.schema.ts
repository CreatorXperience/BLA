import { z } from "zod";
import { FileKind } from "@prisma/client";

export const RegisterMediaSchema = z
  .object({
    filename: z.string().trim().min(1).max(300),
    originalName: z.string().trim().min(1).max(300),
    mimeType: z.string().trim().min(1),
    sizeBytes: z.number().int().min(0),
    width: z.number().int().min(0).optional(),
    height: z.number().int().min(0).optional(),
    url: z.string().url(),
    thumbUrl: z.string().url().optional(),
    kind: z.nativeEnum(FileKind).default(FileKind.IMAGE),
    cloudKey: z.string().trim().min(1),
    bucket: z.string().trim().default("atelier-media"),
    altText: z.string().trim().max(300).optional(),
    folder: z.string().trim().max(200).default("/"),
    checksum: z.string().optional(),
  })
  .strict();

export type RegisterMediaInput = z.infer<typeof RegisterMediaSchema>;

export const PresignUploadSchema = z
  .object({
    folder: z.string().trim().max(200).default("uploads"),
    filename: z.string().trim().min(1).max(300),
    mimeType: z.string().trim().min(1),
  })
  .strict();

export type PresignUploadInput = z.infer<typeof PresignUploadSchema>;

export const MediaQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
  kind: z.nativeEnum(FileKind).optional(),
  folder: z.string().optional(),
  q: z.string().optional(),
});

export type MediaQuery = z.infer<typeof MediaQuerySchema>;

export const UpdateMediaSchema = z
  .object({
    altText: z.string().trim().max(300).optional(),
    folder: z.string().trim().max(200).optional(),
  })
  .strict();

export type UpdateMediaInput = z.infer<typeof UpdateMediaSchema>;
