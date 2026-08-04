/**
 * Consistent API envelope so the frontend can rely on a single contract:
 *
 *   { success, message, data, meta, error }
 */

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CursorMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
  hasMore: boolean;
}

export interface ApiMeta {
  requestId?: string;
  cache?: boolean;
  pagination?: PaginationMeta;
  cursor?: CursorMeta;
}

export function success<T>(data: T, message = "OK", meta?: ApiMeta) {
  return {
    success: true as const,
    message,
    data,
    meta,
  };
}

export function successList<T>(data: T[], meta: PaginationMeta | CursorMeta, message = "OK") {
  return {
    success: true as const,
    message,
    data,
    meta,
  };
}

export function failure(message: string, code?: string, details?: unknown) {
  return {
    success: false as const,
    message,
    error: { code, details },
  };
}

export function paginationMeta(
  page: number,
  perPage: number,
  total: number,
): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
  return {
    page,
    perPage,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export function cursorMeta(
  itemsLength: number,
  perPage: number,
  nextCursor: string | null,
  total: number,
): CursorMeta {
  return {
    nextCursor,
    prevCursor: null,
    total,
    hasMore: itemsLength === perPage && nextCursor !== null,
  };
}
