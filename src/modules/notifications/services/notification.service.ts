import { NotificationChannel, NotificationStatus, NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { emailQueue, notificationQueue, safeAdd } from "@/queues";
import { sendEmail } from "./email.service";
import { logger } from "@/shared/logger";

/**
 * Notification orchestrator. Enqueues outbound jobs and persists an in-app
 * notification record so the dashboard can surface activity.
 */
export class NotificationService {
  /**
   * Send an email now (used by queue workers / immediate flows).
   */
  async sendEmailNow(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
  }): Promise<boolean> {
    const result = await sendEmail(params);
    return result !== null;
  }

  /**
   * Persist an in-app notification for a user.
   */
  async notifyUser(params: {
    userId: string;
    type: NotificationType;
    channel?: NotificationChannel;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const channel = params.channel ?? NotificationChannel.EMAIL;
    const preference = await prisma.notificationPreference.findUnique({
      where: {
        userId_channel_type: {
          userId: params.userId,
          channel,
          type: params.type,
        },
      },
    });
    if (preference && !preference.enabled) return;

    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        channel,
        title: params.title,
        body: params.body,
        data: params.data as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * Queue an email. Returns immediately; the worker performs the send.
   */
  async queueEmail(params: {
    to: string;
    subject: string;
    template: string;
    data: Record<string, unknown>;
  }): Promise<string> {
    return safeAdd(emailQueue, "send-email", params, {
      attempts: 4,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
    });
  }

  async queueNotification(params: {
    userId?: string;
    channel: "email" | "sms" | "whatsapp";
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    recipient?: string;
  }): Promise<string> {
    return safeAdd(notificationQueue, "send-notification", params, {
      attempts: 3,
      backoff: { type: "exponential", delay: 3_000 },
    });
  }

  async createOutboundMessage(params: {
    channel: NotificationChannel;
    recipient: string;
    subject?: string;
    content: string;
    template?: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await prisma.outboundMessage.create({
        data: {
          channel: params.channel,
          recipient: params.recipient,
          subject: params.subject,
          content: params.content,
          template: params.template,
          payload: params.payload as Prisma.InputJsonValue | undefined,
          status: NotificationStatus.QUEUED,
        },
      });
    } catch (error) {
      logger.error({ error }, "outbound message persist failed");
    }
  }

  /** Dispatch based on channel for the notification worker. */
  async dispatch(params: {
    channel: "email" | "sms" | "whatsapp";
    recipient: string;
    subject?: string;
    content: string;
    template?: string;
    payload?: Record<string, unknown>;
  }): Promise<boolean> {
    if (params.channel === "email") {
      return this.sendEmailNow({
        to: params.recipient,
        subject: params.subject ?? "Notification",
        html: params.content,
      });
    }
    // SMS / WhatsApp providers can be added here (Twilio, Termii, Meta Cloud API).
    logger.info({ channel: params.channel, recipient: params.recipient }, "sms/whatsapp provider not configured, simulated");
    return true;
  }
}

export const notificationService = new NotificationService();
