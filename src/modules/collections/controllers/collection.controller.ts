import type { Context } from "hono";
import { collectionService } from "../services/collection.service";
import { success } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import type { AddProductsInput, CreateCollectionInput, UpdateCollectionInput } from "../validators";

export class CollectionController {
  list = async (c: Context): Promise<Response> => {
    const limit = Number(c.req.query("limit") ?? 50);
    const query = {
      isActive: c.req.query("isActive"),
      isFeatured: c.req.query("isFeatured"),
      limit: Number.isFinite(limit) ? limit : 50,
    };
    const result = await collectionService.list(query);
    return c.json(success(result, "Collections", { cache: true }));
  };

  get = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    const collection = await collectionService.get(id);
    return c.json(success(collection, "Collection"));
  };

  getBySlug = async (c: Context): Promise<Response> => {
    const slug = c.req.param("slug") ?? "";
    const collection = await collectionService.getBySlug(slug);
    return c.json(success(collection, "Collection", { cache: true }));
  };

  create = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as CreateCollectionInput;
    const collection = await collectionService.create(body);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "Collection", entityId: collection.id, c });
    return c.json(success(collection, "Collection created"), 201);
  };

  update = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as UpdateCollectionInput;
    const collection = await collectionService.update(id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Collection", entityId: id, c });
    return c.json(success(collection, "Collection updated"));
  };

  addProducts = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as AddProductsInput;
    const collection = await collectionService.addProducts(id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Collection", entityId: id, metadata: { products: body.productIds.length }, c });
    return c.json(success(collection, "Products added"));
  };

  removeProduct = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const productId = c.req.param("productId") ?? "";
    const result = await collectionService.removeProduct(id, productId);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Collection", entityId: id, metadata: { productId }, c });
    return c.json(success(result, "Product removed from collection"));
  };

  remove = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const result = await collectionService.remove(id);
    await recordAudit({ actorId: user.id, action: AuditAction.DELETE, entity: "Collection", entityId: id, c });
    return c.json(success(result, "Collection deleted"));
  };
}

export const collectionController = new CollectionController();
