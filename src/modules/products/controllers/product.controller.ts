import type { Context } from "hono";
import { productService } from "../services/product.service";
import { success } from "@/shared/apiResponse";
import { getAuth, getAuthUser } from "@/middleware/auth";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import { logger } from "@/shared/logger";
import type {
  CreateProductInput,
  ProductFlagsInput,
  PublishProductInput,
  UpdateProductInput,
} from "../validators";
import type { PublicProductQuery, AdminProductQuery } from "../validators";

export class ProductController {
  // --- public catalog -------------------------------------------------------

  listPublic = async (c: Context): Promise<Response> => {
    const query = c.req.valid("query" as never) as PublicProductQuery;
    const result = await productService.listPublic(query);
    return c.json(success(result, "Products", { cache: true }));
  };

  getPublic = async (c: Context): Promise<Response> => {
    const slug = c.req.param("slug") ?? "";
    const user = getAuthUser(c);
    const product = await productService.getPublic(slug, user?.id);
    return c.json(success(product, "Product", { cache: true }));
  };

  related = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    const limit = Number(c.req.query("limit") ?? 6);
    const products = await productService.related(id, limit);
    return c.json(success(products, "Related products", { cache: true }));
  };

  recentlyViewed = async (c: Context): Promise<Response> => {
    const idsRaw = c.req.query("ids");
    const ids = (idsRaw ?? "").split(",").filter(Boolean);
    const excludeId = c.req.query("excludeId");
    const limit = Number(c.req.query("limit") ?? 6);
    const products = await productService.recentlyViewed(ids, excludeId, limit);
    return c.json(success(products, "Recently viewed products"));
  };

  recommended = async (c: Context): Promise<Response> => {
    const user = getAuthUser(c);
    const limit = Number(c.req.query("limit") ?? 8);
    const products = await productService.recommended(user?.id, limit);
    return c.json(success(products, "Recommended products", { cache: true }));
  };

  featured = async (c: Context): Promise<Response> => {
    const limit = Number(c.req.query("limit") ?? 8);
    const products = await productService.byFlags({ isFeatured: true }, limit);
    return c.json(success(products, "Featured products", { cache: true }));
  };

  bestSellers = async (c: Context): Promise<Response> => {
    const limit = Number(c.req.query("limit") ?? 8);
    const products = await productService.byFlags({ isBestSeller: true }, limit);
    return c.json(success(products, "Best sellers", { cache: true }));
  };

  trending = async (c: Context): Promise<Response> => {
    const limit = Number(c.req.query("limit") ?? 8);
    const products = await productService.byFlags({ isTrending: true }, limit);
    return c.json(success(products, "Trending products", { cache: true }));
  };

  newArrivals = async (c: Context): Promise<Response> => {
    const limit = Number(c.req.query("limit") ?? 8);
    const products = await productService.byFlags({ isNewArrival: true }, limit);
    return c.json(success(products, "New arrivals", { cache: true }));
  };

  // --- admin ----------------------------------------------------------------

  listAdmin = async (c: Context): Promise<Response> => {
    const query = c.req.valid("query" as never) as AdminProductQuery;
    const result = await productService.listAdmin(query);
    return c.json(success(result, "Products"));
  };

  getAdmin = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    const product = await productService.getAdmin(id);
    return c.json(success(product, "Product"));
  };

  create = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as CreateProductInput;
    const product = await productService.createProduct(body, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "Product", entityId: product.id, after: { name: product.name }, c });
    return c.json(success(product, "Product created"), 201);
  };

  update = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as UpdateProductInput;
    const product = await productService.updateProduct(id, body, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Product", entityId: id, c });
    return c.json(success(product, "Product updated"));
  };

  flags = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as ProductFlagsInput;
    const product = await productService.toggleFlags(id, body, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Product", entityId: id, metadata: { flags: body }, c });
    return c.json(success(product, "Product flags updated"));
  };

  schedule = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as PublishProductInput;
    const product = await productService.schedulePublishing(id, body, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Product", entityId: id, metadata: { publishAt: product.publishAt }, c });
    return c.json(success(product, "Publishing scheduled"));
  };

  archive = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const result = await productService.archiveProduct(id, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Product", entityId: id, metadata: { status: "archived" }, c });
    return c.json(success(result, "Product archived"));
  };

  restore = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const result = await productService.restoreProduct(id, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.RESTORE, entity: "Product", entityId: id, c });
    return c.json(success(result, "Product restored"));
  };

  remove = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const result = await productService.deleteProduct(id, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.DELETE, entity: "Product", entityId: id, c });
    return c.json(success(result, "Product deleted"));
  };

  duplicate = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const product = await productService.duplicateProduct(id, user.id);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "Product", entityId: product.id, metadata: { duplicatedFrom: id }, c });
    return c.json(success(product, "Product duplicated"), 201);
  };

  stats = async (c: Context): Promise<Response> => {
    const stats = await productService.stats();
    return c.json(success(stats, "Product stats"));
  };
}

export const productController = new ProductController();
