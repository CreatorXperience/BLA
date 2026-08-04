/**
 * Standalone BullMQ worker entrypoint.
 * Run with: `npm run worker`
 */
import { startWorkers, closeWorkers } from "./index";
import { logger } from "@/shared/logger";

async function main(): Promise<void> {
  startWorkers();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down workers");
    await closeWorkers();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandled rejection");
  });
}

main().catch((error) => {
  logger.error({ error }, "worker bootstrap failed");
  process.exit(1);
});
