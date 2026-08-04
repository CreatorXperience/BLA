import { NotFoundError } from "@/shared/errors";
import { recordAudit } from "@/middleware/audit";
import { cmsRepository } from "../repositories/cms.repository";
import type { UpsertHomepageSectionInput, UpsertNavItemInput, UpsertPageInput } from "../types";

export class CmsService {
  // ---- Homepage ----
  async getHomepage() {
    const [sections, announcement, navigation] = await Promise.all([
      cmsRepository.listHomepageSections(),
      cmsRepository.getActiveAnnouncement(),
      cmsRepository.listNavigation(true),
    ]);
    return {
      sections: sections.filter((s) => s.status === "ACTIVE"),
      announcement,
      navigation,
    };
  }

  async listHomepageSections() {
    return cmsRepository.listHomepageSections();
  }

  async upsertHomepageSection(sectionKey: string, input: UpsertHomepageSectionInput, actor?: { id: string; email: string }) {
    const section = await cmsRepository.upsertHomepageSection(sectionKey, input, actor?.email);
    if (actor) {
      await recordAudit({
        actorId: actor.id,
        action: "UPDATE",
        entity: "homepage-section",
        entityId: section.id,
        metadata: { sectionKey },
      });
    }
    return section;
  }

  async deleteHomepageSection(sectionKey: string, actor?: { id: string; email: string }) {
    await cmsRepository.deleteHomepageSection(sectionKey);
    if (actor) {
      await recordAudit({
        actorId: actor.id,
        action: "DELETE",
        entity: "homepage-section",
        entityId: sectionKey,
        metadata: { sectionKey },
      });
    }
  }

  // ---- Settings ----
  async getPublicSettings() {
    const settings = await cmsRepository.listSettings();
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  }

  async listSettings(group?: string) {
    return cmsRepository.listSettings(group);
  }

  async setSetting(key: string, value: unknown, group: string, isSecret: boolean, description?: string, actor?: { id: string; email: string }) {
    const setting = await cmsRepository.setSetting(key, value, group, isSecret, description);
    if (actor) {
      await recordAudit({
        actorId: actor.id,
        action: "UPDATE",
        entity: "setting",
        entityId: setting.id,
        metadata: { key },
      });
    }
    return setting;
  }

  async deleteSetting(key: string, actor?: { id: string; email: string }) {
    await cmsRepository.deleteSetting(key);
    if (actor) {
      await recordAudit({
        actorId: actor.id,
        action: "DELETE",
        entity: "setting",
        entityId: key,
        metadata: { key },
      });
    }
  }

  // ---- Announcement ----
  async getActiveAnnouncement() {
    return cmsRepository.getActiveAnnouncement();
  }

  async listAnnouncements() {
    return cmsRepository.listAnnouncements();
  }

  async upsertAnnouncement(id: string | undefined, input: Omit<Parameters<typeof cmsRepository.upsertAnnouncement>[1], "id" | "startsAt" | "endsAt"> & { startsAt?: Date | null; endsAt?: Date | null }) {
    const data = {
      message: input.message,
      link: input.link ?? null,
      isActive: input.isActive,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    };
    return cmsRepository.upsertAnnouncement(id, data);
  }

  async deleteAnnouncement(id: string) {
    return cmsRepository.deleteAnnouncement(id);
  }

  // ---- Navigation ----
  async listNavigation() {
    return cmsRepository.listNavigation();
  }

  async upsertNavItem(id: string | undefined, input: UpsertNavItemInput) {
    return cmsRepository.upsertNavItem(id, input);
  }

  async deleteNavItem(id: string) {
    return cmsRepository.deleteNavItem(id);
  }

  // ---- Pages ----
  async listPages(includeUnpublished: boolean) {
    return cmsRepository.listPages(includeUnpublished);
  }

  async getPageBySlug(slug: string) {
    const page = await cmsRepository.getPageBySlug(slug);
    if (!page) throw new NotFoundError("Page not found");
    return page;
  }

  async upsertPage(id: string | undefined, input: UpsertPageInput, actor?: { id: string; email: string }) {
    const page = await cmsRepository.upsertPage(id, input);
    if (actor) {
      await recordAudit({
        actorId: actor.id,
        action: id ? "UPDATE" : "CREATE",
        entity: "page",
        entityId: page.id,
        metadata: { slug: page.slug },
      });
    }
    return page;
  }

  async deletePage(id: string) {
    const page = await cmsRepository.deletePage(id);
    return page;
  }
}

export const cmsService = new CmsService();
