import { z } from "zod";

export const UpdateUserRoleSchema = z.object({
  role: z.enum(["CUSTOMER", "ADMIN", "EDITOR", "MANAGER", "SUPER_ADMIN"]),
});

export const UpdateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const ListUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(100).optional(),
  role: z.enum(["CUSTOMER", "ADMIN", "EDITOR", "MANAGER", "SUPER_ADMIN"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  sort: z.enum(["createdAt", "lastLoginAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const AuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  entity: z.string().max(100).optional(),
  action: z.string().max(50).optional(),
  actorId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
