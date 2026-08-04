/** Slugify text into a URL-safe slug with support for Unicode -> ASCII. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateUniqueSlug(base: string): string {
  const slug = slugify(base) || "item";
  const suffix = Date.now().toString(36).slice(-4);
  return `${slug}-${suffix}`;
}
