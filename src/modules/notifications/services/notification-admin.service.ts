import { NotificationChannel, NotificationStatus, NotificationType } from "@prisma/client";
import { notificationQueue } from "@/queues";
import { notificationRepository } from "../repositories/notification.repository";
import { notificationService } from "./notification.service";
import { recordAudit } from "@/middleware/audit";
import type { BroadcastInput } from "../types";
import { logger } from "@/shared/logger";

export class NotificationAdminService {
  /**
   * Send a broadcast email to the selected audience. Fan-out happens in the
   * background via the notification queue to avoid blocking the request.
   */
  async broadcast(input: BroadcastInput, actor?: { id: string; email: string }) {
    const audience: string[] = [];
    if (input.audience === "ALL_CUSTOMERS" || input.audience === "ALL") {
      audience.push(...(await notificationRepository.customerEmails()));
    }
    if (input.audience === "NEWS") {
      // Newsletters are captured via the newsletter section / signup; fall back to customers.
      audience.push(...(await notificationRepository.customerEmails()));
    }

    const deduped = Array.from(new Set(audience));

    if (deduped.length === 0) {
      return { queued: 0, audience: [] };
    }

    let queued = 0;
    for (const email of deduped) {
      try {
        await notificationService.queueNotification({
          recipient: email,
          channel: "email",
          type: "MARKETING",
          title: input.subject,
          body: input.body,
        });
        await notificationService.createOutboundMessage({
          channel: NotificationChannel.EMAIL,
          recipient: email,
          subject: input.subject,
          content: input.body,
          template: "broadcast",
          payload: { audience: input.audience },
        });
        queued += 1;
      } catch (error) {
        logger.error({ error, email }, "broadcast enqueue failed");
      }
    }

    if (actor) {
      await recordAudit({
        actorId: actor.id,
        action: "CREATE",
        entity: "broadcast",
        metadata: { audience: input.audience, queued, subject: input.subject },
      });
    }

    return { queued, audience: deduped.slice(0, 20) };
  }

  async listOutbound(params: { page: number; perPage: number; channel?: string; status?: string }) {
    return notificationRepository.listOutbound(params);
  }

  /** Clean failed jobs and mark an outbound message as failed. */
  async markFailed(id: string, error?: string) {
    await notificationQueue.clean(0, 100, "failed");
    const { prisma } = await import("@/database/prisma");
    return prisma.outboundMessage.update({
      where: { id },
      data: { status: NotificationStatus.FAILED, error },
    });
  }
}

export const notificationAdminService = new NotificationAdminService();
