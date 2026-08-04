import { Hono } from "hono";
import { searchController } from "../controllers/search.controller";
import { requireAuth } from "@/middleware/auth";
import { rateLimit } from "@/middleware/rateLimit";

export function searchRoutes(): Hono {
  const router = new Hono();

  router.get("/", rateLimit({ windowMs: 60_000, max: 60 }), searchController.search);
  router.get("/autocomplete", rateLimit({ windowMs: 60_000, max: 120 }), searchController.autocomplete);
  router.get("/trending", searchController.trending);
  router.get("/recent", requireAuth, searchController.recent);
  router.delete("/recent", requireAuth, searchController.clearRecent);

  return router;
}
