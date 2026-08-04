import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import type { PaymentStatus, PaymentProvider, PaymentMethod } from "@prisma/client";

export class PaymentRepository {
  findByReference(reference: string) {
    return prisma.payment.findUnique({ where: { reference }, include: { order: true, refunds: true, logs: { orderBy: { createdAt: "desc" } } } });
  }

  findById(id: string) {
    return prisma.payment.findUnique({ where: { id }, include: { order: true, refunds: true, logs: { orderBy: { createdAt: "desc" } } } });
  }

  findPendingByOrder(orderId: string) {
    return prisma.payment.findFirst({ where: { orderId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  }

  create(params: {
    orderId: string;
    provider: PaymentProvider;
    method?: PaymentMethod | null;
    reference: string;
    amount: number;
    currency: string;
    meta?: unknown;
  }) {
    return prisma.payment.create({
      data: {
        orderId: params.orderId,
        provider: params.provider,
        method: params.method,
        reference: params.reference,
        amount: params.amount,
        currency: params.currency,
        meta: params.meta as Prisma.InputJsonValue | undefined,
      },
    });
  }

  update(id: string, data: Prisma.PaymentUpdateInput) {
    return prisma.payment.update({ where: { id }, data });
  }

  async log(params: { paymentId: string; event: string; message?: string; payload?: unknown; ipAddress?: string }) {
    return prisma.paymentLog.create({
      data: {
        paymentId: params.paymentId,
        event: params.event,
        message: params.message,
        payload: params.payload as Prisma.InputJsonValue | undefined,
        ipAddress: params.ipAddress,
      },
    });
  }

  listForOrder(orderId: string) {
    return prisma.payment.findMany({
      where: { orderId },
      include: { refunds: true, logs: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async list(query: { page: number; perPage: number; status?: string; provider?: string }) {
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status as PaymentStatus } : {}),
      ...(query.provider ? { provider: query.provider as PaymentProvider } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: { order: { select: { orderNumber: true } } },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.count({ where }),
    ]);
    return { data, total, page: query.page, perPage: query.perPage };
  }

  async createRefund(params: {
    paymentId: string;
    orderId: string;
    reference: string;
    amount: number;
    reason?: string;
    externalRef?: string;
  }) {
    return prisma.refund.create({
      data: {
        paymentId: params.paymentId,
        orderId: params.orderId,
        reference: params.reference,
        amount: params.amount,
        reason: params.reason,
        externalRef: params.externalRef,
      },
    });
  }

  updateRefund(id: string, data: Prisma.RefundUpdateInput) {
    return prisma.refund.update({ where: { id }, data });
  }
}

export const paymentRepository = new PaymentRepository();
