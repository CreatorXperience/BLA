import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { cmsController } from "../controllers/cms.controller";
import { requireAuth, requireRole } from "@/middleware/auth";
import {
  UpsertHomepageSectionSchema,
  SetStoreSettingSchema,
  UpsertAnnouncementSchema,
  UpsertNavItemSchema,
  UpsertPageSchema,
} from "../validators/cms.schema";

export function cmsRoutes(): Hono {
  const router = new Hono();

  // ---- Public storefront endpoints ----
  router.get("/homepage", cmsController.homepage);
  router.get("/settings/public", cmsController.publicSettings);
  router.get("/announcement", cmsController.activeAnnouncement);
  router.get("/navigation", cmsController.publicNav);
  router.get("/pages/:slug", cmsController.publicPage);

  // ---- Admin ----
  const admin = new Hono();
  admin.use(requireAuth, requireRole("ADMIN", "EDITOR", "MANAGER", "SUPER_ADMIN"));

  admin.get("/homepage-sections", cmsController.listHomepageSections);
  admin.put("/homepage-sections/:sectionKey", zValidator("json", UpsertHomepageSectionSchema), cmsController.upsertHomepageSection);
  admin.delete("/homepage-sections/:sectionKey", cmsController.deleteHomepageSection);

  admin.get("/settings", cmsController.listSettings);
  admin.put("/settings", zValidator("json", SetStoreSettingSchema), cmsController.setSetting);
  admin.delete("/settings/:key", cmsController.deleteSetting);

  admin.get("/announcements", cmsController.listAnnouncements);
  admin.put("/announcements/:id?", zValidator("json", UpsertAnnouncementSchema), cmsController.upsertAnnouncement);
  admin.delete("/announcements/:id", cmsController.deleteAnnouncement);

  admin.get("/navigation", cmsController.adminNav);
  admin.put("/navigation/:id?", zValidator("json", UpsertNavItemSchema), cmsController.upsertNavItem);
  admin.delete("/navigation/:id", cmsController.deleteNavItem);

  admin.get("/pages", cmsController.adminListPages);
  admin.get("/pages/:id", cmsController.adminGetPage);
  admin.put("/pages/:id?", zValidator("json", UpsertPageSchema), cmsController.upsertPage);
  admin.delete("/pages/:id", cmsController.deletePage);

  router.route("/admin", admin);

  return router;
}
