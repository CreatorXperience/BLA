import { PrismaClient } from "@prisma/client";
import { env } from "@/config";
import { logger } from "@/shared/logger";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? [{ emit: "event", level: "query" }, { emit: "stdout", level: "error" }]
        : [{ emit: "stdout", level: "error" }, { emit: "stdout", level: "warn" }],
  });
}

/**
 * Singleton Prisma client. In development the client is stored on globalThis
 * so hot-reloads do not exhaust database connections.
 */
export const prisma =
  global.__prisma ??
  (() => {
    const client = createPrismaClient();

    if (env.NODE_ENV === "development") {
      global.__prisma = client;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).$on("query" as never, (e: any) => {
        if (e.query && !e.query.startsWith("--")) {
          logger.debug({ query: e.query, durationMs: e.duration }, "prisma:query");
        }
      });
    }

    return client;
  })();

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ error }, "database connection check failed");
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
