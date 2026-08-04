import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { slugify } from "@/utils/slugify";
import type { UpsertHomepageSectionInput, UpsertNavItemInput, UpsertPageInput } from "../types";

export class CmsRepository {
  // ---- Homepage sections ----
  async listHomepageSections() {
    return prisma.homepageContent.findMany({
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
    });
  }

  async getHomepageSection(sectionKey: string) {
    return prisma.homepageContent.findUnique({ where: { sectionKey } });
  }

  async upsertHomepageSection(sectionKey: string, input: UpsertHomepageSectionInput, publishedBy?: string) {
    const data: Prisma.HomepageContentUncheckedCreateInput = {
      sectionKey,
      sectionType: input.sectionType,
      title: input.title ?? null,
      subtitle: input.subtitle ?? null,
      content: (input.content as Prisma.InputJsonValue) ?? undefined,
      status: input.status,
      sortOrder: input.sortOrder,
      publishedBy,
      ...(input.status === "ACTIVE" ? { publishedAt: new Date() } : { publishedAt: null }),
    };
    return prisma.homepageContent.upsert({
      where: { sectionKey },
      update: data,
      create: data,
    });
  }

  async deleteHomepageSection(sectionKey: string) {
    return prisma.homepageContent.delete({ where: { sectionKey } });
  }

  // ---- Store settings ----
  async listSettings(group?: string, includeSecret = false) {
    const where = group ? { group } : {};
    const rows = await prisma.storeSetting.findMany({
      where,
      orderBy: [{ group: "asc" }, { key: "asc" }],
    });
    return rows
      .filter((r) => includeSecret || !r.isSecret)
      .map((r) => ({ ...r, value: r.isSecret && !includeSecret ? undefined : r.value }));
  }

  async setSetting(key: string, value: unknown, group = "general", isSecret = false, description?: string) {
    return prisma.storeSetting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue, group, isSecret, description },
      create: { key, value: value as Prisma.InputJsonValue, group, isSecret, description },
    });
  }

  async deleteSetting(key: string) {
    return prisma.storeSetting.delete({ where: { key } });
  }

  // ---- Announcement bar ----
  async getActiveAnnouncement() {
    const now = new Date();
    return prisma.announcementBar.findFirst({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async upsertAnnouncement(id: string | undefined, input: Prisma.AnnouncementBarUncheckedCreateInput) {
    if (id) {
      return prisma.announcementBar.update({ where: { id }, data: input });
    }
    return prisma.announcementBar.create({ data: input });
  }

  async listAnnouncements() {
    return prisma.announcementBar.findMany({ orderBy: { updatedAt: "desc" } });
  }

  async deleteAnnouncement(id: string) {
    return prisma.announcementBar.delete({ where: { id } });
  }

  // ---- Navigation ----
  async listNavigation(activeOnly = false) {
    const rows = await prisma.navigationItem.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
    });
    const map = new Map<string, typeof rows[number] & { children: typeof rows }>();
    rows.forEach((r) => map.set(r.id, { ...r, children: [] }));
    const tree: typeof rows = [];
    for (const row of rows) {
      const node = map.get(row.id)!;
      if (row.parentId && map.has(row.parentId)) {
        map.get(row.parentId)!.children.push(node);
      } else {
        tree.push(node);
      }
    }
    return tree;
  }

  async upsertNavItem(id: string | undefined, input: UpsertNavItemInput) {
    const data: Prisma.NavigationItemUncheckedCreateInput = {
      label: input.label,
      url: input.url ?? null,
      type: input.type,
      refId: input.refId ?? null,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    };
    if (id) return prisma.navigationItem.update({ where: { id }, data });
    return prisma.navigationItem.create({ data });
  }

  async deleteNavItem(id: string) {
    return prisma.navigationItem.delete({ where: { id } });
  }

  // ---- Pages ----
  async listPages(includeUnpublished = false) {
    return prisma.page.findMany({
      where: includeUnpublished ? undefined : { isPublished: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async getPageBySlug(slug: string, publishedOnly = true) {
    return prisma.page.findFirst({
      where: { slug, ...(publishedOnly ? { isPublished: true } : {}) },
    });
  }

  async upsertPage(id: string | undefined, input: UpsertPageInput) {
    const slug = slugify(input.slug);
    const data = {
      title: input.title,
      slug,
      body: input.body,
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      isPublished: input.isPublished,
      publishedAt: input.isPublished ? new Date() : null,
    };
    if (id) return prisma.page.update({ where: { id }, data });
    return prisma.page.create({ data });
  }

  async deletePage(id: string) {
    return prisma.page.delete({ where: { id } });
  }
}

export const cmsRepository = new CmsRepository();
