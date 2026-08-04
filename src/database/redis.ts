import Redis from "ioredis";
import { env } from "@/config";
import { logger } from "@/shared/logger";

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

export const redis =
  global.__redis ??
  (() => {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    client.on("error", (err) => logger.error({ err }, "redis connection error"));
    client.on("ready", () => logger.info("redis connected"));
    client.on("close", () => logger.warn("redis connection closed"));

    if (env.NODE_ENV === "development") {
      global.__redis = client;
    }

    return client;
  })();

/**
 * Redis cache helpers with namespacing and TTL.
 */

export function cacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `cache:${prefix}:${parts.join(":")}`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (redis.status !== "ready") return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    logger.warn({ error, key }, "cache get failed");
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number = env.REDIS_CACHE_TTL,
): Promise<void> {
  if (redis.status !== "ready") return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    logger.warn({ error, key }, "cache set failed");
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (error) {
    logger.warn({ error, keys }, "cache del failed");
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  if (redis.status !== "ready") return;
  try {
    const stream = redis.scanStream({ match: pattern, count: 500 });
    const keys: string[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (batch: string[]) => {
        keys.push(...batch);
      });
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    logger.warn({ error, pattern }, "cache del pattern failed");
  }
}

/** Fetch-through cache: on miss runs loader, stores result, returns it. */
export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlSeconds?: number,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await loader();
  if (value !== null && value !== undefined) {
    await cacheSet(key, value, ttlSeconds);
  }
  return value;
}

export async function flushRedis(): Promise<void> {
  await redis.flushall();
}

export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
}
