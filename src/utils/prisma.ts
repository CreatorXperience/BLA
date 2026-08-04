import type { Prisma } from "@prisma/client";
import type { PaginationMeta } from "@/shared/apiResponse";
import { paginationMeta } from "@/shared/apiResponse";

export interface OffsetPageOptions {
  page?: number;
  perPage?: number;
}

export interface OffsetPage<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Build a Prisma findMany argument with offset pagination + ordering. */
export function buildPagination<T extends Record<string, unknown>>(
  options: OffsetPageOptions,
  defaultOrderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: "desc" },
): { skip: number; take: number; page: number; perPage: number; orderBy: typeof defaultOrderBy } {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(100, Math.max(1, options.perPage ?? 20));
  return { skip: (page - 1) * perPage, take: perPage, page, perPage, orderBy: defaultOrderBy };
}

export async function offsetPaginate<T, A extends { count: (args?: unknown) => Promise<number>; findMany: (args: unknown) => Promise<T[]> }>(
  client: A,
  baseArgs: Record<string, unknown>,
  options: OffsetPageOptions,
): Promise<OffsetPage<T>> {
  const { skip, take, page, perPage, orderBy } = buildPagination(options);
  const [total, data] = await Promise.all([
    client.count({ where: baseArgs.where }),
    client.findMany({ ...baseArgs, skip, take, orderBy }),
  ]);
  return { data, meta: paginationMeta(page, perPage, total) };
}

/** Encode a cursor for a given value + id (stable ordering). */
export function encodeCursor(value: string | number | Date, id: string): string {
  const payload = `${String(value instanceof Date ? value.toISOString() : value)}:${id}`;
  return Buffer.from(payload).toString("base64url");
}

export function decodeCursor(cursor: string): { value: string | number | Date; id: string } {
  const [value, id] = Buffer.from(cursor, "base64url").toString("utf8").split(":");
  if (value === undefined || id === undefined) {
    throw new Error("Invalid cursor");
  }
  const parsed: string | number | Date =
    !Number.isNaN(Number(value)) && value !== "" ? Number(value) : value;
  return { value: parsed, id };
}
