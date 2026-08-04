import type { Context, Next } from "hono";
import { AppError, ValidationError } from "@/shared/errors";
import { logger } from "@/shared/logger";

/**
 * Wrap an async controller handler so rejected promises are forwarded to the
 * global error handler instead of crashing the process.
 */
export function asyncHandler<T extends Context = Context>(
  fn: (c: T) => Promise<Response> | Response,
) {
  return async (c: T, next: Next): Promise<Response> => {
    try {
      const result = await fn(c);
      return result ?? next();
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) throw error;
      // Zod errors from validators are handled by Hono's onError if attached,
      // but we normalize unknown errors here.
      logger.error({ error, path: c.req.path }, "unhandled controller error");
      throw error;
    }
  };
}
