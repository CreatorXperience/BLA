import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";

export class NotificationRepository {
  async listOutbound(params: { page: number; perPage: number; channel?: string; status?: string }) {
    const where: Prisma.OutboundMessageWhereInput = {
      ...(params.channel ? { channel: params.channel as Prisma.OutboundMessageWhereInput["channel"] } : {}),
      ...(params.status ? { status: params.status as Prisma.OutboundMessageWhereInput["status"] } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.outboundMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
      }),
      prisma.outboundMessage.count({ where }),
    ]);
    return { data, total };
  }

  async customerEmails(): Promise<string[]> {
    const users = await prisma.user.findMany({
      where: { role: "CUSTOMER", emailVerifiedAt: { not: null } },
      select: { email: true },
    });
    return users.map((u) => u.email);
  }
}

export const notificationRepository = new NotificationRepository();
