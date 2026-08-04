import type { Context, MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";
import { logger } from "@/shared/logger";

/**
 * Assigns a request id, logs every request/response with timing, and stores
 * the id on context for propagation into error responses.
 */
export const requestLogger: MiddlewareHandler = async (c, next) => {
  const requestId = randomUUID();
  const start = performance.now();

  c.set("request", { requestId });

  logger.info(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      userAgent: c.req.header("user-agent"),
    },
    "request:start",
  );

  await next();

  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  const status = c.res.status;

  if (status >= 500) {
    logger.error({ requestId, method: c.req.method, path: c.req.path, status, durationMs }, "request:error");
  } else {
    logger.info({ requestId, method: c.req.method, path: c.req.path, status, durationMs }, "request:end");
  }
};
