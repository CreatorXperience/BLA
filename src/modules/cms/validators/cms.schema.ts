import { z } from "zod";

export const UpsertHomepageSectionSchema = z.object({
  sectionType: z.enum(["HERO_BANNER", "ANNOUNCEMENT_BAR", "FEATURED_COLLECTIONS", "FEATURED_PRODUCTS", "NEW_ARRIVALS", "EDITORIAL", "INSTAGRAM_GALLERY", "TESTIMONIALS", "NEWSLETTER", "PROMOTIONAL_BANNER", "FOOTER_LINK", "NAVIGATION"]),
  title: z.string().max(255).optional(),
  subtitle: z.string().max(1000).optional(),
  content: z.record(z.unknown()).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DRAFT"]).default("ACTIVE"),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export type UpsertHomepageSectionInput = z.infer<typeof UpsertHomepageSectionSchema>;

export const SetStoreSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
  group: z.string().max(50).default("general"),
  isSecret: z.boolean().default(false),
  description: z.string().max(500).optional(),
});

export const UpsertAnnouncementSchema = z.object({
  message: z.string().min(1).max(500),
  link: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});

export const UpsertNavItemSchema = z.object({
  label: z.string().min(1).max(100),
  url: z.string().max(500).optional().nullable(),
  type: z.enum(["CUSTOM", "CATEGORY", "COLLECTION", "PRODUCT", "PAGE"]).default("CUSTOM"),
  refId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const UpsertPageSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  body: z.string().min(1),
  metaTitle: z.string().max(200).optional().nullable(),
  metaDescription: z.string().max(300).optional().nullable(),
  isPublished: z.boolean().default(false),
});

export type UpsertNavItemInput = z.infer<typeof UpsertNavItemSchema>;
export type UpsertPageInput = z.infer<typeof UpsertPageSchema>;
