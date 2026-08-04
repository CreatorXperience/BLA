import type { Context } from "hono";
import { notificationAdminService } from "../services/notification-admin.service";
import { success, paginationMeta } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import type { BroadcastInput } from "../types";

export class NotificationController {
  broadcast = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as BroadcastInput;
    const result = await notificationAdminService.broadcast(body, { id: user.id, email: user.email });
    return c.json(success(result, "Broadcast queued"));
  };

  listOutbound = async (c: Context): Promise<Response> => {
    const page = Number(c.req.query("page") ?? 1);
    const perPage = Number(c.req.query("perPage") ?? 20);
    const channel = c.req.query("channel");
    const status = c.req.query("status");
    const { data, total } = await notificationAdminService.listOutbound({ page, perPage, channel, status });
    return c.json(success(data, "Outbound messages", { pagination: paginationMeta(page, perPage, total) }));
  };

  getOutbound = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    const { prisma } = await import("@/database/prisma");
    const message = await prisma.outboundMessage.findUnique({ where: { id } });
    if (!message) return c.json({ success: false, message: "Outbound message not found" }, 404);
    return c.json(success(message, "Outbound message"));
  };

  resend = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    const { prisma } = await import("@/database/prisma");
    const message = await prisma.outboundMessage.findUnique({ where: { id } });
    if (!message) return c.json({ success: false, message: "Outbound message not found" }, 404);
    if (message.channel !== "EMAIL") {
      return c.json({ success: false, message: "Only email messages can be resent" }, 400);
    }
    const { notificationService } = await import("@/modules/notifications/services/notification.service");
    await notificationService.queueNotification({
      recipient: message.recipient,
      channel: "email",
      type: "MARKETING",
      title: message.subject ?? "Update from ATELIER",
      body: message.content,
      data: { resend: true, originalId: message.id },
    });
    return c.json(success(null, "Message queued for resend"));
  };
}

export const notificationController = new NotificationController();
