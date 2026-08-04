import type { Context } from "hono";
import { analyticsService } from "../services/analytics.service";
import { success } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";
import { randomUUID } from "node:crypto";
import type { TrackEventInput } from "../validators";
import type { AnalyticsRange } from "../validators";

function range(c: Context): AnalyticsRange {
  return {
    from: c.req.query("from"),
    to: c.req.query("to"),
    interval: (c.req.query("interval") as "day" | "week" | "month") ?? "day",
  };
}

export class AnalyticsController {
  /** Public-ish tracking beacon (requires auth but light). */
  track = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = (await c.req.json()) as TrackEventInput;
    await analyticsService.track(body, {
      userId: user.id,
      sessionId: c.req.header("x-session-id") ?? randomUUID(),
      ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: c.req.header("user-agent"),
    });
    return c.json(success(null, "Event tracked"));
  };

  overview = async (c: Context): Promise<Response> => {
    const result = await analyticsService.overview(range(c));
    return c.json(success(result, "Analytics overview", { cache: true }));
  };

  revenue = async (c: Context): Promise<Response> => {
    const result = await analyticsService.revenue(range(c));
    return c.json(success(result, "Revenue analytics", { cache: true }));
  };

  customers = async (c: Context): Promise<Response> => {
    const result = await analyticsService.customers(range(c));
    return c.json(success(result, "Customer analytics", { cache: true }));
  };

  bestSellers = async (c: Context): Promise<Response> => {
    const limit = Number(c.req.query("limit") ?? 10);
    const result = await analyticsService.bestSellers(range(c), limit);
    return c.json(success(result, "Best sellers", { cache: true }));
  };

  topRevenueProducts = async (c: Context): Promise<Response> => {
    const limit = Number(c.req.query("limit") ?? 10);
    const result = await analyticsService.topRevenueProducts(range(c), limit);
    return c.json(success(result, "Top revenue products"));
  };

  traffic = async (c: Context): Promise<Response> => {
    const result = await analyticsService.traffic(range(c));
    return c.json(success(result, "Traffic sources", { cache: true }));
  };

  conversion = async (c: Context): Promise<Response> => {
    const result = await analyticsService.conversion(range(c));
    return c.json(success(result, "Conversion", { cache: true }));
  };
}

export const analyticsController = new AnalyticsController();
