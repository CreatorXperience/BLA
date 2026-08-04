import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { analyticsRepository } from "../repositories/analytics.repository";
import { cached, cacheKey, cacheDelPattern } from "@/database/redis";
import type { AnalyticsRange, TrackEventInput } from "../validators";

const ANALYTICS_CACHE_TTL = 300;

function resolveRange(from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 86_400_000);
  return { from: fromDate, to: toDate };
}

function bucketKey(range: AnalyticsRange, from: Date, to: Date): string {
  return `${range.interval}:${from.toISOString().slice(0, 10)}:${to.toISOString().slice(0, 10)}`;
}

export class AnalyticsService {
  async track(input: TrackEventInput, ctx?: { userId?: string; sessionId?: string; ip?: string; userAgent?: string }) {
    await prisma.analyticsEvent.create({
      data: {
        event: input.event,
        userId: ctx?.userId,
        sessionId: ctx?.sessionId,
        productId: input.productId,
        categoryId: input.categoryId,
        collectionId: input.collectionId,
        source: input.source,
        medium: input.medium,
        value: input.value,
        currency: input.currency,
        meta: input.meta as Prisma.InputJsonValue | undefined,
        ipAddress: ctx?.ip,
        userAgent: ctx?.userAgent,
      },
    });
    await cacheDelPattern("cache:analytics*");
  }

  async overview(range: AnalyticsRange) {
    const { from, to } = resolveRange(range.from, range.to);
    const key = cacheKey("analytics", "overview", bucketKey(range, from, to));

    return cached(
      key,
      async () => {
        const [revenue, orders, customers, conversion, bestSellers, recentOrders, lowStock, revenueSeries] =
          await Promise.all([
            analyticsRepository.revenueSummary(from, to),
            analyticsRepository.orderSummary(from, to),
            analyticsRepository.customerSummary(from, to),
            analyticsRepository.conversionRate(from, to),
            analyticsRepository.bestSellers(5, from, to),
            prisma.order.findMany({
              where: { ...(from || to ? { placedAt: { gte: from, lte: to } } : {}) },
              include: { items: { take: 3 } },
              orderBy: { placedAt: "desc" },
              take: 8,
            }),
            prisma.inventory.count({ where: { status: "LOW_STOCK" } }),
            analyticsRepository.revenueOverTime(from, to),
          ]);

        const revenueByBucket = this.bucketizeRevenue(revenueSeries, range.interval, from, to);

        return {
          revenue: Number(revenue.revenue),
          orders: revenue.orders,
          averageOrderValue: orders.averageOrderValue,
          customers: customers.total,
          newCustomers: customers.newCustomers,
          returningCustomers: customers.returningCustomers,
          conversionRate: conversion.rate,
          lowStockCount: lowStock,
          revenueSeries: revenueByBucket,
          bestSellers,
          recentOrders: recentOrders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            email: o.email,
            status: o.status,
            grandTotal: o.grandTotal.toString(),
            placedAt: o.placedAt,
          })),
        };
      },
      ANALYTICS_CACHE_TTL,
    );
  }

  async revenue(range: AnalyticsRange) {
    const { from, to } = resolveRange(range.from, range.to);
    const key = cacheKey("analytics", "revenue", bucketKey(range, from, to));
    return cached(
      key,
      async () => {
        const [summary, series, byCollection, byCategory, aov] = await Promise.all([
          analyticsRepository.revenueSummary(from, to),
          analyticsRepository.revenueOverTime(from, to),
          analyticsRepository.salesByCollection(from, to),
          analyticsRepository.salesByCategory(from, to),
          analyticsRepository.orderSummary(from, to),
        ]);
        return {
          totalRevenue: Number(summary.revenue),
          paidOrders: summary.orders,
          averageOrderValue: aov.averageOrderValue,
          series: this.bucketizeRevenue(series, range.interval, from, to),
          byCollection,
          byCategory,
        };
      },
      ANALYTICS_CACHE_TTL,
    );
  }

  async customers(range: AnalyticsRange) {
    const { from, to } = resolveRange(range.from, range.to);
    const key = cacheKey("analytics", "customers", bucketKey(range, from, to));
    return cached(
      key,
      async () => analyticsRepository.customerSummary(from, to),
      ANALYTICS_CACHE_TTL,
    );
  }

  async bestSellers(range: AnalyticsRange, limit = 10) {
    const { from, to } = resolveRange(range.from, range.to);
    const key = cacheKey("analytics", "bestsellers", bucketKey(range, from, to), String(limit));
    return cached(
      key,
      async () => analyticsRepository.bestSellers(limit, from, to),
      ANALYTICS_CACHE_TTL,
    );
  }

  async topRevenueProducts(range: AnalyticsRange, limit = 10) {
    const { from, to } = resolveRange(range.from, range.to);
    return analyticsRepository.topProductsByRevenue(limit, from, to);
  }

  async traffic(range: AnalyticsRange) {
    const { from, to } = resolveRange(range.from, range.to);
    const key = cacheKey("analytics", "traffic", bucketKey(range, from, to));
    return cached(
      key,
      async () => analyticsRepository.trafficSources(from, to),
      ANALYTICS_CACHE_TTL,
    );
  }

  async conversion(range: AnalyticsRange) {
    const { from, to } = resolveRange(range.from, range.to);
    const key = cacheKey("analytics", "conversion", bucketKey(range, from, to));
    return cached(
      key,
      async () => analyticsRepository.conversionRate(from, to),
      ANALYTICS_CACHE_TTL,
    );
  }

  async invalidate() {
    await cacheDelPattern("cache:analytics*");
  }

  private bucketizeRevenue(
    rows: Array<{ paidAt: Date | null; grandTotal: unknown }>,
    interval: "day" | "week" | "month",
    from: Date,
    to: Date,
  ) {
    const buckets = new Map<string, number>();
    const cursor = new Date(from);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const step =
      interval === "month" ? 30 * 86_400_000 : interval === "week" ? 7 * 86_400_000 : 86_400_000;

    for (let t = cursor.getTime(); t <= to.getTime(); t += step) {
      buckets.set(fmt(new Date(t)), 0);
    }

    for (const row of rows) {
      if (!row.paidAt) continue;
      const key = fmt(row.paidAt);
      if (buckets.has(key)) {
        buckets.set(key, buckets.get(key)! + Number(row.grandTotal ?? 0));
      }
    }

    return [...buckets.entries()].map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));
  }
}

export const analyticsService = new AnalyticsService();
