import type { Context } from "hono";
import { mediaService } from "../services/media.service";
import { success, paginationMeta } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import { env } from "@/config";
import type { MediaQuery, PresignUploadInput, RegisterMediaInput, UpdateMediaInput } from "../validators";

export class MediaController {
  /** Presign a direct-to-storage upload (best for large files). */
  presign = async (c: Context): Promise<Response> => {
    const body = (await c.req.json()) as PresignUploadInput;
    const result = await mediaService.presignUpload(body);
    return c.json(success(result, "Upload prepared"));
  };

  /** Register a media record after a presigned upload completes. */
  register = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as RegisterMediaInput;
    const media = await mediaService.register(body, user.id);
    return c.json(success(media, "Media registered"), 201);
  };

  /** Multipart upload through the API (auto-optimized). */
  upload = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const form = await c.req.parseBody();

    const fileField = form["file"];
    const folder = (form["folder"] as string) ?? "uploads";

    if (!fileField || typeof fileField === "string" || !("arrayBuffer" in fileField)) {
      return c.json({ success: false, message: "No file provided" }, 400);
    }

    const buffer = Buffer.from(await fileField.arrayBuffer());
    const media = await mediaService.uploadFile({
      folder,
      originalName: fileField.name ?? "upload",
      mimeType: fileField.type ?? "application/octet-stream",
      buffer,
      uploadedById: user.id,
    });
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "MediaAsset", entityId: media.id, c });
    return c.json(success(media, "File uploaded"), 201);
  };

  list = async (c: Context): Promise<Response> => {
    const query = c.req.query();
    const result = await mediaService.list(query as unknown as MediaQuery);
    return c.json(success(result.data, "Media", { pagination: paginationMeta(result.page, result.perPage, result.total) }));
  };

  folders = async (c: Context): Promise<Response> => {
    return c.json(success(await mediaService.listFolders(), "Folders"));
  };

  get = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    return c.json(success(await mediaService.get(id), "Media"));
  };

  update = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as UpdateMediaInput;
    const media = await mediaService.update(id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "MediaAsset", entityId: id, c });
    return c.json(success(media, "Media updated"));
  };

  remove = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const result = await mediaService.remove(id);
    await recordAudit({ actorId: user.id, action: AuditAction.DELETE, entity: "MediaAsset", entityId: id, c });
    return c.json(success(result, "Media deleted"));
  };
}

export const mediaController = new MediaController();
