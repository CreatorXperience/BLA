import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { env } from "@/config";
import { uploadObject, deleteObject, publicUrl } from "./storage.service";
import { imageProcessingQueue } from "@/queues";
import { logger } from "@/shared/logger";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export function isImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(mime);
}

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(mime) || ALLOWED_VIDEO_TYPES.includes(mime);
}

export function mediaChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function buildMediaKey(folder: string, originalName: string): { key: string; baseKey: string } {
  const cleanFolder = folder.replace(/^\/+|\/+$/g, "").replace(/[^\w/\-]/g, "-") || "uploads";
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "bin";
  const id = randomUUID();
  const base = `${cleanFolder}/${id}`;
  return { key: `${base}.${ext}`, baseKey: base };
}

/** Compress an image buffer to webp at the configured quality. */
export async function optimizeImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .webp({ quality: env.IMAGE_COMPRESSION_QUALITY })
    .toBuffer();
}

/** Generate a thumbnail (square-ish, capped at 400px). */
export async function generateThumbnail(buffer: Buffer, size = 400): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: size, height: size, fit: "cover" })
    .webp({ quality: 72 })
    .toBuffer();
}

export async function imageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/**
 * Process an uploaded image synchronously: compress + thumbnail, upload both,
 * return URLs. Falls back to original upload if sharp fails.
 */
export async function processAndUploadImage(params: {
  folder: string;
  originalName: string;
  buffer: Buffer;
}): Promise<{ url: string; thumbUrl: string; width: number; height: number; sizeBytes: number }> {
  const { key, baseKey } = buildMediaKey(params.folder, params.originalName);
  const { width, height } = await imageDimensions(params.buffer);

  try {
    const optimized = await optimizeImage(params.buffer);
    const thumb = await generateThumbnail(params.buffer);
    const [url, thumbUrl] = await Promise.all([
      uploadObject(key, optimized, "image/webp"),
      uploadObject(`${baseKey}-thumb.webp`, thumb, "image/webp"),
    ]);
    return { url, thumbUrl, width, height, sizeBytes: optimized.length };
  } catch (error) {
    logger.warn({ error }, "image optimization failed, uploading original");
    const url = await uploadObject(key, params.buffer, "application/octet-stream");
    return { url, thumbUrl: url, width, height, sizeBytes: params.buffer.length };
  }
}

/** Upload raw (e.g. video) with no transformation. */
export async function uploadRaw(params: { folder: string; originalName: string; buffer: Buffer; mime: string }) {
  const { key } = buildMediaKey(params.folder, params.originalName);
  const url = await uploadObject(key, params.buffer, params.mime);
  return { key, url, sizeBytes: params.buffer.length };
}

/** Queue async optimization for a previously-uploaded asset. */
export async function queueOptimization(params: { mediaId: string; cloudKey: string; mime: string }) {
  await imageProcessingQueue.add(
    "optimize",
    {
      mediaId: params.mediaId,
      cloudKey: params.cloudKey,
      bucket: env.S3_BUCKET,
      mimeType: params.mime,
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  );
}

export function buildPublicUrl(key: string): string {
  return publicUrl(key);
}
