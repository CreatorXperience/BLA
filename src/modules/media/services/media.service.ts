import { mediaRepository } from "../repositories/media.repository";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { deleteObject } from "../services/storage.service";
import { buildMediaKey, isAllowedMime, mediaChecksum, processAndUploadImage, uploadRaw } from "../services/image.service";
import { env } from "@/config";
import type { PresignUploadInput, RegisterMediaInput, UpdateMediaInput, MediaQuery } from "../validators";
import { presignPut } from "../services/storage.service";

export class MediaService {
  async presignUpload(input: PresignUploadInput) {
    if (!isAllowedMime(input.mimeType)) {
      throw new ValidationError(`Unsupported file type: ${input.mimeType}`);
    }
    const { key } = buildMediaKey(input.folder, input.filename);
    const url = await presignPut(key, input.mimeType);
    return { key, uploadUrl: url, publicUrl: url.split("?")[0] ?? "" };
  }

  async uploadFile(params: { folder: string; originalName: string; mimeType: string; buffer: Buffer; uploadedById?: string }) {
    if (!isAllowedMime(params.mimeType)) {
      throw new ValidationError(`Unsupported file type: ${params.mimeType}`);
    }
    if (params.buffer.length > env.MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
      throw new ValidationError(`File exceeds the ${env.MAX_UPLOAD_SIZE_MB}MB limit`);
    }

    let url: string;
    let thumbUrl: string | null = null;
    let width = 0;
    let height = 0;
    let sizeBytes = params.buffer.length;
    let cloudKey = "";

    if (params.mimeType.startsWith("image/")) {
      const result = await processAndUploadImage({
        folder: params.folder,
        originalName: params.originalName,
        buffer: params.buffer,
      });
      url = result.url;
      thumbUrl = result.thumbUrl;
      width = result.width;
      height = result.height;
      sizeBytes = result.sizeBytes;
      cloudKey = "";
    } else {
      const result = await uploadRaw({
        folder: params.folder,
        originalName: params.originalName,
        buffer: params.buffer,
        mime: params.mimeType,
      });
      url = result.url;
      cloudKey = result.key;
    }

    const media = await mediaRepository.create({
      filename: params.originalName,
      originalName: params.originalName,
      mimeType: params.mimeType,
      sizeBytes,
      width: width || undefined,
      height: height || undefined,
      kind: params.mimeType.startsWith("image/") ? "IMAGE" : "VIDEO",
      url,
      thumbUrl,
      cloudKey,
      bucket: env.S3_BUCKET,
      folder: params.folder,
      checksum: mediaChecksum(params.buffer),
      uploadedById: params.uploadedById,
    });

    return media;
  }

  /** Register a metadata record after direct-to-R2 (presigned) upload. */
  async register(input: RegisterMediaInput, uploadedById?: string) {
    const media = await mediaRepository.create({
      filename: input.filename,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      kind: input.kind,
      url: input.url,
      thumbUrl: input.thumbUrl,
      cloudKey: input.cloudKey,
      bucket: input.bucket,
      altText: input.altText,
      folder: input.folder,
      checksum: input.checksum,
      uploadedById,
    });
    return media;
  }

  list(query: MediaQuery) {
    return mediaRepository.list(query);
  }

  listFolders() {
    return mediaRepository.listFolders();
  }

  async get(id: string) {
    const media = await mediaRepository.findById(id);
    if (!media) throw new NotFoundError("Media not found");
    return media;
  }

  async update(id: string, input: UpdateMediaInput) {
    const media = await mediaRepository.findById(id);
    if (!media) throw new NotFoundError("Media not found");
    return mediaRepository.update(id, {
      ...(input.altText !== undefined && { altText: input.altText }),
      ...(input.folder !== undefined && { folder: input.folder }),
    });
  }

  async remove(id: string) {
    const media = await mediaRepository.findById(id);
    if (!media) throw new NotFoundError("Media not found");
    if (media.cloudKey) {
      await deleteObject(media.cloudKey);
    }
    await mediaRepository.delete(id);
    return { id };
  }
}

export const mediaService = new MediaService();
