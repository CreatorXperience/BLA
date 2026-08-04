import type { Context } from "hono";
import { adminService } from "../services/admin.service";
import { success, paginationMeta } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import type { Role } from "@prisma/client";

export class AdminController {
  listUsers = async (c: Context): Promise<Response> => {
    const page = Number(c.req.query("page") ?? 1);
    const perPage = Number(c.req.query("perPage") ?? 20);
    const { data, total } = await adminService.listUsers({
      page,
      perPage,
      q: c.req.query("q"),
      role: c.req.query("role"),
      isActive: c.req.query("isActive"),
      sort: (c.req.query("sort") as "createdAt" | "lastLoginAt") ?? "createdAt",
      order: (c.req.query("order") as "asc" | "desc") ?? "desc",
    });
    return c.json(success(data, "Users", { pagination: paginationMeta(page, perPage, total) }));
  };

  getUser = async (c: Context): Promise<Response> => {
    const user = await adminService.getUserDetails(c.req.param("id") ?? "");
    return c.json(success(user, "User"));
  };

  updateRole = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as { role: Role };
    const updated = await adminService.updateRole(c.req.param("id") ?? "", body.role, { id: user.id, email: user.email });
    return c.json(success(updated, "Role updated"));
  };

  updateStatus = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as { isActive: boolean };
    const updated = await adminService.updateStatus(c.req.param("id") ?? "", body.isActive, { id: user.id, email: user.email });
    return c.json(success(updated, "User status updated"));
  };

  listAuditLogs = async (c: Context): Promise<Response> => {
    const page = Number(c.req.query("page") ?? 1);
    const perPage = Number(c.req.query("perPage") ?? 20);
    const { data, total } = await adminService.listAuditLogs({
      page,
      perPage,
      entity: c.req.query("entity"),
      action: c.req.query("action"),
      actorId: c.req.query("actorId"),
      from: c.req.query("from"),
      to: c.req.query("to"),
    });
    return c.json(success(data, "Audit logs", { pagination: paginationMeta(page, perPage, total) }));
  };
}

export const adminController = new AdminController();
