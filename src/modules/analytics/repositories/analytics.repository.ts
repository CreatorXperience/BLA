import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { cached, cacheKey } from "@/database/redis";

const PAID_STATUSES = ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] as const;

function dateRange(from?: Date, to?: Date): { gte?: Date; lte?: Date } {
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}

export class AnalyticsRepository {
  /** Revenue + order count over a range, bucketed by interval. */
  async revenueOverTime(from: Date, to: Date) {
    const orders = await prisma.order.findMany({
      where: { status: { in: [...PAID_STATUSES] }, paidAt: { gte: from, lte: to } },
      select: { paidAt: true, grandTotal: true },
    });
    return orders;
  }

  async revenueSummary(from?: Date, to?: Date) {
    const where: Prisma.OrderWhereInput = {
      status: { in: [...PAID_STATUSES] },
      ...(from || to ? { paidAt: dateRange(from, to) } : {}),
    };
    const agg = await prisma.order.aggregate({
      where,
      _sum: { grandTotal: true },
      _count: true,
    });
    return { revenue: agg._sum.grandTotal ?? 0, orders: agg._count };
  }

  async orderSummary(from?: Date, to?: Date) {
    const where = { ...(from || to ? { placedAt: dateRange(from, to) } : {}) };
    const [total, byStatus, aov] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.order.aggregate({
        where: { ...where, status: { in: [...PAID_STATUSES] } },
        _avg: { grandTotal: true },
      }),
    ]);
    return { total, byStatus, averageOrderValue: Number(aov._avg.grandTotal ?? 0) };
  }

  async customerSummary(from?: Date, to?: Date) {
    const where = { ...(from || to ? { createdAt: dateRange(from, to) } : {}) };
    const [total, newCustomers] = await Promise.all([
      prisma.user.count({ where: { role: "CUSTOMER" } }),
      prisma.user.count({ where: { role: "CUSTOMER", ...where } }),
    ]);

    // Returning customers: customers with >1 paid order in range
    const orderWhere: Prisma.OrderWhereInput = {
      status: { in: [...PAID_STATUSES] },
      userId: { not: null },
      ...(from || to ? { placedAt: dateRange(from, to) } : {}),
    };
    const grouped = await prisma.order.groupBy({
      by: ["userId"],
      where: orderWhere,
      _count: { _all: true },
    });
    const returning = grouped.filter((g) => g._count._all > 1).length;

    return { total, newCustomers, returningCustomers: returning };
  }

  async bestSellers(limit = 10, from?: Date, to?: Date) {
    const orderWhere: Prisma.OrderWhereInput = {
      status: { in: [...PAID_STATUSES] },
      ...(from || to ? { placedAt: dateRange(from, to) } : {}),
    };
    const orderIds = await prisma.order.findMany({ where: orderWhere, select: { id: true } });
    const ids = orderIds.map((o) => o.id);
    if (ids.length === 0) return [];

    const items = await prisma.orderItem.groupBy({
      by: ["productId", "productName"],
      where: { orderId: { in: ids } },
      _sum: { quantity: true },
      _count: { productId: true },
    });

    const sorted = items.sort((a, b) => (b._sum.quantity ?? 0) - (a._sum.quantity ?? 0)).slice(0, limit);
    const productIds = sorted.map((s) => s.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, slug: true, images: { orderBy: { sortOrder: "asc" }, take: 1 } },
    });
    const imgMap = new Map(products.map((p) => [p.id, p]));

    return sorted.map((s) => ({
      productId: s.productId,
      name: s.productName,
      slug: imgMap.get(s.productId)?.slug ?? "",
      imageUrl: imgMap.get(s.productId)?.images[0]?.url ?? null,
      unitsSold: s._sum.quantity ?? 0,
      orderCount: s._count.productId,
    }));
  }

  async topProductsByRevenue(limit = 10, from?: Date, to?: Date) {
    const orderWhere: Prisma.OrderWhereInput = {
      status: { in: [...PAID_STATUSES] },
      ...(from || to ? { placedAt: dateRange(from, to) } : {}),
    };
    const orders = await prisma.order.findMany({
      where: orderWhere,
      select: { id: true, items: { select: { productId: true, productName: true, totalPrice: true, quantity: true } } },
    });
    const map = new Map<string, { productId: string; name: string; revenue: number; units: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const entry = map.get(item.productId) ?? { productId: item.productId, name: item.productName, revenue: 0, units: 0 };
        entry.revenue += Number(item.totalPrice);
        entry.units += item.quantity;
        map.set(item.productId, entry);
      }
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
  }

  async salesByCollection(from?: Date, to?: Date) {
    const orderWhere: Prisma.OrderWhereInput = {
      status: { in: [...PAID_STATUSES] },
      ...(from || to ? { placedAt: dateRange(from, to) } : {}),
    };
    const orders = await prisma.order.findMany({
      where: orderWhere,
      select: { items: { select: { productId: true, totalPrice: true } } },
    });
    const productIds = Array.from(new Set(orders.flatMap((o) => o.items.map((i) => i.productId))));
    if (productIds.length === 0) return [];

    const links = await prisma.collectionProduct.findMany({
      where: { productId: { in: productIds } },
      include: { collection: { select: { id: true, name: true, slug: true } } },
    });
    const revenueMap = new Map<string, number>();
    for (const order of orders) {
      for (const item of order.items) {
        revenueMap.set(item.productId, (revenueMap.get(item.productId) ?? 0) + Number(item.totalPrice));
      }
    }
    const collectionMap = new Map<string, { id: string; name: string; slug: string; revenue: number }>();
    for (const link of links) {
      const revenue = revenueMap.get(link.productId) ?? 0;
      const entry = collectionMap.get(link.collectionId) ?? { ...link.collection, revenue: 0 };
      entry.revenue += revenue;
      collectionMap.set(link.collectionId, entry);
    }
    return [...collectionMap.values()].sort((a, b) => b.revenue - a.revenue);
  }

  async salesByCategory(from?: Date, to?: Date) {
    const orderWhere: Prisma.OrderWhereInput = {
      status: { in: [...PAID_STATUSES] },
      ...(from || to ? { placedAt: dateRange(from, to) } : {}),
    };
    const orders = await prisma.order.findMany({
      where: orderWhere,
      select: { items: { select: { productId: true, totalPrice: true } } },
    });
    const productIds = Array.from(new Set(orders.flatMap((o) => o.items.map((i) => i.productId))));
    if (productIds.length === 0) return [];

    const links = await prisma.productCategory.findMany({
      where: { productId: { in: productIds } },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    const revenueMap = new Map<string, number>();
    for (const order of orders) {
      for (const item of order.items) {
        revenueMap.set(item.productId, (revenueMap.get(item.productId) ?? 0) + Number(item.totalPrice));
      }
    }
    const categoryMap = new Map<string, { id: string; name: string; slug: string; revenue: number }>();
    for (const link of links) {
      const revenue = revenueMap.get(link.productId) ?? 0;
      const entry = categoryMap.get(link.categoryId) ?? { ...link.category, revenue: 0 };
      entry.revenue += revenue;
      categoryMap.set(link.categoryId, entry);
    }
    return [...categoryMap.values()].sort((a, b) => b.revenue - a.revenue);
  }

  async trafficSources(from?: Date, to?: Date) {
    const where = { ...(from || to ? { createdAt: dateRange(from, to) } : {}), source: { not: null } };
    const grouped = await prisma.analyticsEvent.groupBy({
      by: ["source"],
      where,
      _count: { _all: true },
    });
    return grouped.map((g) => ({ source: g.source ?? "direct", views: g._count._all })).sort((a, b) => b.views - a.views);
  }

  async conversionRate(from?: Date, to?: Date) {
    const eventWhere = { ...(from || to ? { createdAt: dateRange(from, to) } : {}) };
    const [checkoutStarts, purchases] = await Promise.all([
      prisma.analyticsEvent.count({ where: { ...eventWhere, event: "CHECKOUT_START" } }),
      prisma.analyticsEvent.count({ where: { ...eventWhere, event: "PURCHASE" } }),
    ]);
    return { checkoutStarts, purchases, rate: checkoutStarts > 0 ? Number(((purchases / checkoutStarts) * 100).toFixed(2)) : 0 };
  }
}

export const analyticsRepository = new AnalyticsRepository();
