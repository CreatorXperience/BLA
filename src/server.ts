import { serve } from "@hono/node-server";
import { buildApp } from "./app";
import { env, isProduction } from "./config";
import { prisma } from "./database/prisma";
import { logger } from "./shared/logger";
import { paymentService } from "@/modules/payments/services/payment.service";

/**
 * Periodically cancel orders abandoned before payment completed so an
 * interrupted/cancelled gateway attempt never leaves a stuck PENDING order with
 * deducted stock. Runs in the API process (no Redis/BullMQ dependency) and is
 * guarded against overlapping runs.
 */
function startAbandonedPaymentSweep(): NodeJS.Timeout {
  const graceMs = env.ORDER_PAYMENT_GRACE_MS ?? 30 * 60 * 1000;
  const intervalMs = env.ORDER_PAYMENT_SWEEP_MS ?? 5 * 60 * 1000;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const expired = await paymentService.expireAbandonedPayments(graceMs);
      if (expired > 0) logger.info({ expired, graceMs }, "expired abandoned orders");
    } catch (error) {
      logger.error({ err: error }, "abandoned-payment sweep failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(run, intervalMs);
  timer.unref();
  void run(); // kick off shortly after boot
  return timer;
}

/**
 * HTTP server bootstrap. Gracefully drains connections and closes the DB
 * pool on shutdown. Queue workers are launched in a separate process
 * (`npm run worker`) so API and jobs scale independently.
 */
async function main(): Promise<void> {
  const app = buildApp();
  const sweepTimer = startAbandonedPaymentSweep();

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
    clearInterval(sweepTimer);
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
    logger.error({ err: reason }, "unhandled rejection");
    if (isProduction) process.exit(1);
  });
}

main().catch((error) => {
  logger.error({ error }, "server bootstrap failed");
  process.exit(1);
});
