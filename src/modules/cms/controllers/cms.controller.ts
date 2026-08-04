import type { Context } from "hono";
import { cmsService } from "../services/cms.service";
import { success } from "@/shared/apiResponse";
import { getAuth } from "@/middleware/auth";

export class CmsController {
  // ---- Public ----
  homepage = async (c: Context): Promise<Response> => {
    const data = await cmsService.getHomepage();
    return c.json(success(data, "Homepage content"));
  };

  publicSettings = async (c: Context): Promise<Response> => {
    const data = await cmsService.getPublicSettings();
    return c.json(success(data, "Public store settings"));
  };

  activeAnnouncement = async (c: Context): Promise<Response> => {
    const data = await cmsService.getActiveAnnouncement();
    return c.json(success(data, "Announcement"));
  };

  publicPage = async (c: Context): Promise<Response> => {
    const slug = c.req.param("slug") ?? "";
    const data = await cmsService.getPageBySlug(slug);
    return c.json(success(data, "Page"));
  };

  publicNav = async (c: Context): Promise<Response> => {
    const data = await cmsService.listNavigation();
    return c.json(success(data, "Navigation"));
  };

  // ---- Admin: homepage sections ----
  listHomepageSections = async (c: Context): Promise<Response> => {
    const data = await cmsService.listHomepageSections();
    return c.json(success(data, "Homepage sections"));
  };

  upsertHomepageSection = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const sectionKey = c.req.param("sectionKey") ?? "";
    const body = await c.req.json();
    const data = await cmsService.upsertHomepageSection(sectionKey, body, { id: user.id, email: user.email });
    return c.json(success(data, "Homepage section saved"));
  };

  deleteHomepageSection = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const sectionKey = c.req.param("sectionKey") ?? "";
    await cmsService.deleteHomepageSection(sectionKey, { id: user.id, email: user.email });
    return c.json(success(null, "Homepage section deleted"));
  };

  // ---- Admin: settings ----
  listSettings = async (c: Context): Promise<Response> => {
    const group = c.req.query("group");
    const data = await cmsService.listSettings(group);
    return c.json(success(data, "Store settings"));
  };

  setSetting = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const body = await c.req.json();
    const data = await cmsService.setSetting(body.key, body.value, body.group, body.isSecret, body.description, { id: user.id, email: user.email });
    return c.json(success(data, "Setting saved"));
  };

  deleteSetting = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const key = c.req.param("key") ?? "";
    await cmsService.deleteSetting(key, { id: user.id, email: user.email });
    return c.json(success(null, "Setting deleted"));
  };

  // ---- Admin: announcements ----
  listAnnouncements = async (c: Context): Promise<Response> => {
    const data = await cmsService.listAnnouncements();
    return c.json(success(data, "Announcements"));
  };

  upsertAnnouncement = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") || undefined;
    const body = await c.req.json();
    const data = await cmsService.upsertAnnouncement(id, body);
    return c.json(success(data, "Announcement saved"));
  };

  deleteAnnouncement = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    await cmsService.deleteAnnouncement(id);
    return c.json(success(null, "Announcement deleted"));
  };

  // ---- Admin: navigation ----
  adminNav = async (c: Context): Promise<Response> => {
    const data = await cmsService.listNavigation();
    return c.json(success(data, "Navigation"));
  };

  upsertNavItem = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") || undefined;
    const body = await c.req.json();
    const data = await cmsService.upsertNavItem(id, body);
    return c.json(success(data, "Nav item saved"));
  };

  deleteNavItem = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    await cmsService.deleteNavItem(id);
    return c.json(success(null, "Nav item deleted"));
  };

  // ---- Admin: pages ----
  adminListPages = async (c: Context): Promise<Response> => {
    const includeUnpublished = c.req.query("includeUnpublished") === "true";
    const data = await cmsService.listPages(includeUnpublished);
    return c.json(success(data, "Pages"));
  };

  adminGetPage = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    const pages = await cmsService.listPages(true);
    const page = pages.find((p) => p.id === id);
    if (!page) return c.json(success(null, "Page not found"), 404);
    return c.json(success(page, "Page"));
  };

  upsertPage = async (c: Context): Promise<Response> => {
    const { user } = getAuth(c);
    const id = c.req.param("id") || undefined;
    const body = await c.req.json();
    const data = await cmsService.upsertPage(id, body, { id: user.id, email: user.email });
    return c.json(success(data, "Page saved"));
  };

  deletePage = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    await cmsService.deletePage(id);
    return c.json(success(null, "Page deleted"));
  };
}

export const cmsController = new CmsController();
