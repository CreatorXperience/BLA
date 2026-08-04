import type { Context } from "hono";
import { dashboardService } from "../services/dashboard.service";
import { success } from "@/shared/apiResponse";

export class DashboardController {
  overview = async (c: Context): Promise<Response> => {
    const days = Number(c.req.query("days") ?? 30);
    const result = await dashboardService.overview(days);
    return c.json(success(result, "Dashboard overview", { cache: true }));
  };
}

export const dashboardController = new DashboardController();
