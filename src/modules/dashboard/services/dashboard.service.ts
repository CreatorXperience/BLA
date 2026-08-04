import { prisma } from "@/database/prisma";
import { cached, cacheKey } from "@/database/redis";
import { analyticsRepository } from "@/modules/analytics/repositories/analytics.repository";

export class DashboardService {
  /**
   * Aggregate admin dashboard snapshot: KPIs, charts, pending action items.
   * Cached for 60s to keep the panel snappy without hammering the DB.
   */
  async overview(days = 30) {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);

    return cached(
      cacheKey("dashboard", "overview", String(days)),
      async () => {
        const [revenue, orders, customers, products, inventory, reviews, lowStock, pendingOrders, bestSellers, recentOrders, revenueSeries] =
          await Promise.all([
            analyticsRepository.revenueSummary(from, to),
            analyticsRepository.orderSummary(from, to),
            analyticsRepository.customerSummary(from, to),
            prisma.product.count({ where: { deletedAt: null } }),
            inventoryStats(),
            prisma.review.count({ where: { status: "PENDING" } }),
            prisma.inventory.count({ where: { status: "LOW_STOCK" } }),
            prisma.order.count({ where: { status: { in: ["PENDING", "PAID", "PROCESSING"] } } }),
            analyticsRepository.bestSellers(5, from, to),
            prisma.order.findMany({
              include: { user: { select: { firstName: true, lastName: true } } },
              orderBy: { placedAt: "desc" },
              take: 10,
            }),
            analyticsRepository.revenueOverTime(from, to),
          ]);

        return {
          kpis: {
            revenue: Number(revenue.revenue),
            revenueDelta: 0,
            orders: revenue.orders,
            ordersDelta: 0,
            customers: customers.total,
            newCustomers: customers.newCustomers,
            returningCustomers: customers.returningCustomers,
            averageOrderValue: orders.averageOrderValue,
            totalProducts: products,
            pendingReviews: reviews,
          },
          inventory: {
            lowStock,
            inStock: await prisma.inventory.count({ where: { status: "IN_STOCK" } }),
            outOfStock: await prisma.inventory.count({ where: { status: "OUT_OF_STOCK" } }),
          },
          actionItems: {
            pendingOrders,
            lowStockAlerts: lowStock,
            pendingReviews: reviews,
          },
          bestSellers,
          revenueSeries: revenueSeries.map((r) => ({
            date: r.paidAt?.toISOString().slice(0, 10) ?? "",
            value: Number(r.grandTotal ?? 0),
          })),
          recentOrders: recentOrders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            customer: o.user ? `${o.user.firstName ?? ""} ${o.user.lastName ?? ""}`.trim() || o.email : o.email,
            status: o.status,
            grandTotal: o.grandTotal.toString(),
            placedAt: o.placedAt,
          })),
        };
      },
      60,
    );
  }
}

async function inventoryStats() {
  const [inStock, lowStock, outOfStock] = await Promise.all([
    prisma.inventory.count({ where: { status: "IN_STOCK" } }),
    prisma.inventory.count({ where: { status: "LOW_STOCK" } }),
    prisma.inventory.count({ where: { status: "OUT_OF_STOCK" } }),
  ]);
  return { inStock, lowStock, outOfStock };
}

export const dashboardService = new DashboardService();
