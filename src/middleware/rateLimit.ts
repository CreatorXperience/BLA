import type { MiddlewareHandler } from "hono";
import { env } from "@/config";
import { redis } from "@/database/redis";
import { AppError } from "@/shared/errors";
import { logger } from "@/shared/logger";

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyGenerator?: (c: Parameters<MiddlewareHandler>[0]) => string;
  skip?: (c: Parameters<MiddlewareHandler>[0]) => boolean;
}

/**
 * Fixed-window rate limiter backed by Redis (INCR + EXPIRE). Safe across
 * multiple instances because the counter lives in Redis, not in memory.
 */
export function rateLimit(options: RateLimitOptions = {}): MiddlewareHandler {
  const windowMs = options.windowMs ?? env.RATE_LIMIT_WINDOW_MS;
  const max = options.max ?? env.RATE_LIMIT_MAX;

  return async (c, next) => {
    if (options.skip?.(c)) {
      return next();
    }

    const keyGen = options.keyGenerator;
    let identifier = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const apiKey = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").slice(0, 24);
    if (keyGen) {
      identifier = keyGen(c);
    } else if (apiKey) {
      identifier = `key:${apiKey}`;
    } else {
      identifier = `ip:${identifier}`;
    }

    const redisKey = `rl:${c.req.method}:${identifier}:${Math.floor(Date.now() / windowMs)}`;

    try {
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, Math.ceil(windowMs / 1000));
      }

      const remaining = Math.max(0, max - count);
      c.header("X-RateLimit-Limit", String(max));
      c.header("X-RateLimit-Remaining", String(remaining));
      c.header("X-RateLimit-Reset", String(Math.ceil(Date.now() / 1000) + Math.ceil(windowMs / 1000)));

      if (count > max) {
        throw new AppError("RATE_LIMITED", "Too many requests, please slow down");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.warn({ error }, "rate limiter unavailable, allowing request");
    }

    await next();
  };
}

/** Stricter limiter for auth endpoints (login, password reset, OTP). */
export function authRateLimit(): MiddlewareHandler {
  return rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
}
