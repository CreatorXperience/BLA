import { Hono } from "hono";
import { dashboardController } from "../controllers/dashboard.controller";
import { requireAuth, requireRole } from "@/middleware/auth";

export function dashboardRoutes(): Hono {
  const router = new Hono();

  router.use(requireAuth, requireRole("ADMIN", "MANAGER", "SUPER_ADMIN"));
  router.get("/overview", dashboardController.overview);

  return router;
}
