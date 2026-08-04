import { Worker, type Job } from "bullmq";
import { env } from "@/config";
import { QUEUES, type EmailJob, type ImageJob, type InventoryAlertJob, type PaymentVerificationJob, type InvoiceJob, type AnalyticsJob, type NotificationJob } from "@/queues";
import { sendEmail } from "@/modules/notifications/services/email.service";
import { renderTemplate } from "@/modules/notifications/services/templates";
import { processAndUploadImage } from "@/modules/media/services/image.service";
import { getObject } from "@/modules/media/services/storage.service";
import { prisma } from "@/database/prisma";
import { paymentService } from "@/modules/payments/services/payment.service";
import { orderService } from "@/modules/orders/services/order.service";
import { renderInvoice, renderPackingSlip } from "@/modules/orders/services/invoice.service";
import { analyticsService } from "@/modules/analytics/services/analytics.service";
import { notificationService } from "@/modules/notifications/services/notification.service";
import { logger } from "@/shared/logger";

function connection() {
  return {
    host: new URL(env.REDIS_URL).hostname,
    port: Number(new URL(env.REDIS_URL).port || 6379),
    maxRetriesPerRequest: null,
  };
}

const emailWorker = new Worker<EmailJob>(
  QUEUES.EMAIL,
  async (job: Job<EmailJob>) => {
    const { to, subject, template, data, channel } = job.data;
    const html = renderTemplate(template, data);
    const ok = await sendEmail({ to, subject, html });
    if (!ok && job.attemptsMade < (job.opts.attempts ?? 3) - 1) {
      throw new Error(`email delivery failed for ${to}`);
    }
  },
  { connection: connection(), concurrency: 5 },
);

const imageWorker = new Worker<ImageJob>(
  QUEUES.IMAGE_PROCESSING,
  async (job: Job<ImageJob>) => {
    const { mediaId, cloudKey, bucket } = job.data;
    const media = await prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!media) {
      logger.warn({ mediaId }, "image job references missing media asset");
      return;
    }
    const buffer = await getObject(cloudKey);
    const result = await processAndUploadImage({
      folder: media.folder,
      originalName: media.originalName,
      buffer,
    });
    await prisma.mediaAsset.update({
      where: { id: mediaId },
      data: {
        url: result.url,
        thumbUrl: result.thumbUrl,
        width: result.width,
        height: result.height,
        sizeBytes: result.sizeBytes,
        isOptimized: true,
        checksum: media.checksum,
      },
    });
    logger.info({ mediaId, bucket }, "image processed");
  },
  { connection: connection(), concurrency: 4 },
);

const inventoryAlertWorker = new Worker<InventoryAlertJob>(
  QUEUES.INVENTORY_ALERTS,
  async (job: Job<InventoryAlertJob>) => {
    const { variantId, productId, sku, currentQty, threshold } = job.data;
    await prisma.lowStockAlert.create({
      data: {
        variantId,
        productId,
        sku,
        currentQty,
        threshold,
      },
    });
    // Notify admins via the notification queue.
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER", "SUPER_ADMIN"] }, isActive: true },
      select: { email: true },
    });
    for (const admin of admins) {
      await notificationService.queueNotification({
        recipient: admin.email,
        channel: "email",
        type: "LOW_STOCK_ALERT",
        title: `Low stock: ${sku}`,
        body: `Product ${sku} is below the reorder threshold (${currentQty} left, threshold ${threshold}).`,
        data: { variantId, productId, sku },
      });
    }
  },
  { connection: connection(), concurrency: 2 },
);

const paymentVerificationWorker = new Worker<PaymentVerificationJob>(
  QUEUES.PAYMENT_VERIFICATION,
  async (job: Job<PaymentVerificationJob>) => {
    const { paymentId, provider, reference } = job.data;
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      logger.warn({ paymentId }, "payment verification job references missing payment");
      return;
    }
    if (payment.status === "CAPTURED" || payment.status === "AUTHORIZED" || payment.status === "REFUNDED") {
      logger.info({ paymentId }, "payment already settled, skipping verification");
      return;
    }
    await paymentService.verify(reference);
  },
  { connection: connection(), concurrency: 5 },
);

const invoiceWorker = new Worker<InvoiceJob>(
  QUEUES.INVOICE_GENERATION,
  async (job: Job<InvoiceJob>) => {
    const { orderId, kind } = job.data;
    const order = await orderService.getById(orderId);
    if (!order) {
      logger.warn({ orderId }, "invoice job references missing order");
      return;
    }
    const html = kind === "invoice" ? renderInvoice(order) : renderPackingSlip(order);
    const subject =
      kind === "invoice"
        ? `Invoice ${order.orderNumber} — ${env.APP_NAME}`
        : `Packing slip ${order.orderNumber} — ${env.APP_NAME}`;
    await sendEmail({ to: order.email, subject, html });
    logger.info({ orderId, kind }, "document emailed");
  },
  { connection: connection(), concurrency: 3 },
);

const analyticsWorker = new Worker<AnalyticsJob>(
  QUEUES.ANALYTICS_SYNC,
  async (job: Job<AnalyticsJob>) => {
    const { event, payload } = job.data;
    await analyticsService.track(
      {
        event: event as "PAGE_VIEW" | "PRODUCT_VIEW" | "ADD_TO_CART" | "CHECKOUT_START" | "PURCHASE" | "SEARCH",
        ...payload,
      },
      {
        userId: (payload as { userId?: string }).userId,
      },
    );
  },
  { connection: connection(), concurrency: 2 },
);

const notificationWorker = new Worker<NotificationJob>(
  QUEUES.NOTIFICATION,
  async (job: Job<NotificationJob>) => {
    const { recipient, channel, subject, body, data, userId } = job.data;
    const ok = await notificationService.dispatch({
      channel,
      recipient: recipient ?? "",
      subject,
      content: body,
      payload: data,
    });
    if (ok && userId) {
      await notificationService.notifyUser({
        userId,
        type: (data?.notificationType as "ORDER_PLACED" | "PAYMENT_CONFIRMED" | "ORDER_SHIPPED" | "ORDER_DELIVERED" | "WELCOME_EMAIL" | "EMAIL_VERIFICATION" | "PASSWORD_RESET" | "LOW_STOCK_ALERT" | "ORDER_CANCELLED" | "REFUND_ISSUED" | "MARKETING") ?? "ORDER_PLACED",
        channel: "EMAIL",
        title: subject ?? body,
        body,
        data,
      });
    }
    if (!ok) throw new Error(`notification dispatch failed (${channel})`);
  },
  { connection: connection(), concurrency: 10 },
);

export const workers = [
  emailWorker,
  imageWorker,
  inventoryAlertWorker,
  paymentVerificationWorker,
  invoiceWorker,
  analyticsWorker,
  notificationWorker,
];

export function startWorkers(): void {
  for (const worker of workers) {
    worker.on("failed", (job, err) => logger.error({ err, job: job?.name }, "worker job failed"));
    worker.on("error", (err) => logger.error({ err }, "worker error"));
  }
  logger.info({ count: workers.length }, "workers started");
}

export async function closeWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
}

export default { startWorkers, closeWorkers };
