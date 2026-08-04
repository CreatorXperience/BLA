import { Prisma, OrderStatus, OrderEventType } from "@prisma/client";
import { prisma } from "@/database/prisma";
import type { AdminOrderQuery, UserOrderQuery } from "../validators";

export const orderInclude = {
  items: true,
  payments: true,
  timeline: { orderBy: { createdAt: "desc" as const } },
  shippingAddress: true,
  billingAddress: true,
  coupon: true,
  shippingMethod: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export interface CreateOrderData {
  userId?: string;
  email: string;
  phone?: string;
  status?: OrderStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  shippingAddressId?: string;
  billingAddressId?: string;
  shippingAddressSnapshot?: unknown;
  billingAddressSnapshot?: unknown;
  couponId?: string;
  couponCode?: string;
  couponDiscount?: number;
  shippingMethodId?: string;
  shippingZoneId?: string;
  customerNote?: string;
  ipAddress?: string;
  userAgent?: string;
  isGuest: boolean;
  source?: string;
}

export class OrderRepository {
  findById(id: string) {
    return prisma.order.findUnique({ where: { id }, include: orderInclude });
  }

  findByOrderNumber(orderNumber: string) {
    return prisma.order.findUnique({ where: { orderNumber }, include: orderInclude });
  }

  findByIdForUser(id: string, userId: string) {
    return prisma.order.findFirst({ where: { id, userId }, include: orderInclude });
  }

  async create(data: CreateOrderData, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    const order = await client.order.create({
      data: {
        orderNumber: data.status ? this.generateOrderNumber() : this.generateOrderNumber(),
        userId: data.userId,
        email: data.email,
        phone: data.phone,
        status: data.status ?? "PENDING",
        currency: data.currency,
        subtotal: data.subtotal,
        discountTotal: data.discountTotal,
        shippingTotal: data.shippingTotal,
        taxTotal: data.taxTotal,
        grandTotal: data.grandTotal,
        shippingAddressId: data.shippingAddressId,
        billingAddressId: data.billingAddressId,
        shippingAddressSnapshot: data.shippingAddressSnapshot as Prisma.InputJsonValue | undefined,
        billingAddressSnapshot: data.billingAddressSnapshot as Prisma.InputJsonValue | undefined,
        couponId: data.couponId,
        couponCode: data.couponCode,
        couponDiscount: data.couponDiscount ?? 0,
        shippingMethodId: data.shippingMethodId,
        shippingZoneId: data.shippingZoneId,
        customerNote: data.customerNote,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        isGuest: data.isGuest,
        source: data.source ?? "web",
      },
    });
    return order;
  }

  generateOrderNumber(): string {
    return `ATE-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  async addItems(orderId: string, items: Array<{
    productId: string;
    variantId?: string;
    productName: string;
    variantLabel?: string;
    sku: string;
    imageUrl?: string;
    unitPrice: number;
    quantity: number;
    discount?: number;
    totalPrice: number;
    color?: string;
    size?: string;
  }>, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.orderItem.createMany({
      data: items.map((i) => ({
        orderId,
        productId: i.productId,
        variantId: i.variantId,
        productName: i.productName,
        variantLabel: i.variantLabel,
        sku: i.sku,
        imageUrl: i.imageUrl,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        discount: i.discount ?? 0,
        totalPrice: i.totalPrice,
        color: i.color,
        size: i.size,
      })),
    });
  }

  async addTimeline(params: {
    orderId: string;
    eventType: OrderEventType;
    fromStatus?: OrderStatus;
    toStatus?: OrderStatus;
    description: string;
    metadata?: unknown;
    createdById?: string;
  }, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.orderTimeline.create({
      data: {
        orderId: params.orderId,
        eventType: params.eventType,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        description: params.description,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
        createdById: params.createdById,
      },
    });
  }

  update(id: string, data: Prisma.OrderUpdateInput) {
    return prisma.order.update({ where: { id }, data });
  }

  async listForUser(userId: string, query: UserOrderQuery) {
    const where: Prisma.OrderWhereInput = { userId, ...(query.status ? { status: query.status } : {}) };
    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        orderBy: { placedAt: "desc" },
      }),
      prisma.order.count({ where }),
    ]);
    return { data, total, page: query.page, perPage: query.perPage };
  }

  async listAdmin(query: AdminOrderQuery) {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? { placedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: "insensitive" as const } },
              { email: { contains: query.q, mode: "insensitive" as const } },
              { items: { some: { productName: { contains: query.q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.OrderOrderByWithRelationInput[] =
      query.sort === "oldest"
        ? [{ placedAt: "asc" }]
        : query.sort === "total-desc"
          ? [{ grandTotal: "desc" }]
          : query.sort === "total-asc"
            ? [{ grandTotal: "asc" }]
            : [{ placedAt: "desc" }];

    const [data, total] = await Promise.all([
      prisma.order.findMany({ where, include: orderInclude, skip: (query.page - 1) * query.perPage, take: query.perPage, orderBy }),
      prisma.order.count({ where }),
    ]);
    return { data, total, page: query.page, perPage: query.perPage };
  }

  async countByStatus() {
    return prisma.order.groupBy({ by: ["status"], _count: { _all: true } });
  }

  async sumRevenue(from?: Date, to?: Date) {
    const result = await prisma.order.aggregate({
      where: { status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] }, ...(from || to ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      _sum: { grandTotal: true },
      _count: true,
    });
    return { revenue: result._sum.grandTotal?.toString() ?? "0", count: result._count };
  }
}

export const orderRepository = new OrderRepository();
