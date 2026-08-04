import { serve } from "@hono/node-server";
import { buildApp } from "./app";
import { env, isProduction } from "./config";
import { prisma } from "./database/prisma";
import { logger } from "./shared/logger";

/**
 * HTTP server bootstrap. Gracefully drains connections and closes the DB
 * pool on shutdown. Queue workers are launched in a separate process
 * (`npm run worker`) so API and jobs scale independently.
 */
async function main(): Promise<void> {
  const app = buildApp();

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
      hostname: env.HOST,
    },
    (info) => {
      logger.info(
        { host: info.address, port: info.port, env: env.NODE_ENV },
        `${env.APP_NAME} API listening`,
      );
    },
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down HTTP server");
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Force-exit if graceful close hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandled rejection");
    if (isProduction) process.exit(1);
  });
}

main().catch((error) => {
  logger.error({ error }, "server bootstrap failed");
  process.exit(1);
});
