import type { Context } from "hono";
import { categoryService } from "../services/category.service";
import { success } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import { AuditAction } from "@prisma/client";
import { recordAudit } from "@/middleware/audit";
import type { CreateCategoryInput, UpdateCategoryInput } from "../validators";

export class CategoryController {
  list = async (c: Context): Promise<Response> => {
    const query = c.req.query();
    const categories = await categoryService.list(query);
    return c.json(success(categories, "Categories", { cache: true }));
  };

  get = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    const category = await categoryService.get(id);
    return c.json(success(category, "Category"));
  };

  getBySlug = async (c: Context): Promise<Response> => {
    const slug = c.req.param("slug") ?? "";
    const category = await categoryService.getBySlug(slug);
    return c.json(success(category, "Category"));
  };

  create = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as CreateCategoryInput;
    const category = await categoryService.create(body);
    await recordAudit({ actorId: user.id, action: AuditAction.CREATE, entity: "Category", entityId: category.id, c });
    return c.json(success(category, "Category created"), 201);
  };

  update = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const body = (await c.req.json()) as UpdateCategoryInput;
    const category = await categoryService.update(id, body);
    await recordAudit({ actorId: user.id, action: AuditAction.UPDATE, entity: "Category", entityId: id, c });
    return c.json(success(category, "Category updated"));
  };

  remove = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") ?? "";
    const result = await categoryService.remove(id);
    await recordAudit({ actorId: user.id, action: AuditAction.DELETE, entity: "Category", entityId: id, c });
    return c.json(success(result, "Category deleted"));
  };
}

export const categoryController = new CategoryController();
