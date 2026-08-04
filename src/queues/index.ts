import { Queue } from "bullmq";
import { env } from "@/config";
import { redis } from "@/database/redis";
import { logger } from "@/shared/logger";

export const QUEUES = {
  EMAIL: "email",
  IMAGE_PROCESSING: "image-processing",
  INVENTORY_ALERTS: "inventory-alerts",
  PAYMENT_VERIFICATION: "payment-verification",
  INVOICE_GENERATION: "invoice-generation",
  ANALYTICS_SYNC: "analytics-sync",
  NOTIFICATION: "notification",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

function createQueue<T>(name: string): Queue<T> {
  const queue = new Queue<T>(name, {
    connection: {
      host: new URL(env.REDIS_URL).hostname,
      port: Number(new URL(env.REDIS_URL).port || 6379),
      maxRetriesPerRequest: null,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    },
  });
  queue.on("error", (err) => logger.error({ err }, `queue ${name} error`));
  return queue;
}

export const emailQueue = createQueue<EmailJob>(QUEUES.EMAIL);
export const imageProcessingQueue = createQueue<ImageJob>(QUEUES.IMAGE_PROCESSING);
export const inventoryAlertQueue = createQueue<InventoryAlertJob>(QUEUES.INVENTORY_ALERTS);
export const paymentVerificationQueue = createQueue<PaymentVerificationJob>(QUEUES.PAYMENT_VERIFICATION);
export const invoiceGenerationQueue = createQueue<InvoiceJob>(QUEUES.INVOICE_GENERATION);
export const analyticsSyncQueue = createQueue<AnalyticsJob>(QUEUES.ANALYTICS_SYNC);
export const notificationQueue = createQueue<NotificationJob>(QUEUES.NOTIFICATION);

export const queues = {
  email: emailQueue,
  imageProcessing: imageProcessingQueue,
  inventoryAlerts: inventoryAlertQueue,
  paymentVerification: paymentVerificationQueue,
  invoiceGeneration: invoiceGenerationQueue,
  analyticsSync: analyticsSyncQueue,
  notification: notificationQueue,
};

export async function closeQueues(): Promise<void> {
  await Promise.all(Object.values(queues).map((q) => q.close()));
}

/** Add a job without blocking the caller when Redis is unreachable. */
export async function safeAdd<T>(queue: Queue<T>, name: string, data: T, opts?: object): Promise<string> {
  try {
    const job = await Promise.race([
      queue.add(name as never, data as never, opts as never),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("queue timeout")), 3000),
      ),
    ]);
    return job.id ?? "";
  } catch (error) {
    logger.warn({ error, queue: queue.name }, "queue unavailable, skipping job");
    return "";
  }
}

// --- Job payload types ------------------------------------------------------

export interface EmailJob {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
  channel?: "email";
}

export interface ImageJob {
  mediaId: string;
  cloudKey: string;
  bucket: string;
  mimeType: string;
}

export interface InventoryAlertJob {
  variantId: string;
  productId: string;
  sku: string;
  currentQty: number;
  threshold: number;
}

export interface PaymentVerificationJob {
  paymentId: string;
  provider: string;
  reference: string;
}

export interface InvoiceJob {
  orderId: string;
  kind: "invoice" | "packing-slip";
}

export interface AnalyticsJob {
  event: string;
  payload: Record<string, unknown>;
}

export interface NotificationJob {
  userId?: string;
  channel: "email" | "sms" | "whatsapp";
  type: string;
  title: string;
  subject?: string;
  body: string;
  data?: Record<string, unknown>;
  recipient?: string;
}
