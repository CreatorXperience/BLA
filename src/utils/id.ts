import { nanoid } from "nanoid";
import { slugify } from "./slugify";

/** Order number like ATE-2026-000123 */
export function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(100000 + Math.random() * 900000);
  return `ATE-${year}-${seq}`;
}

export function generateSKU(prefix = "ATE"): string {
  return `${prefix}-${nanoid(8).toUpperCase()}`;
}

export function generateReference(prefix: string): string {
  return `${prefix}_${nanoid(16)}`;
}

export function generateId(prefix?: string): string {
  return prefix ? `${prefix}_${nanoid(14)}` : nanoid(14);
}

/** Build a URL-safe slug from a name (uniqueness enforced by callers). */
export function generateUniqueSlug(name: string): string {
  return slugify(name) || `item-${nanoid(6).toLowerCase()}`;
}
