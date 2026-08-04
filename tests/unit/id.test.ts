import { describe, it, expect } from "vitest";
import { generateId, generateOrderNumber, generateReference, generateSKU, generateUniqueSlug } from "@/utils/id";
import { slugify } from "@/utils/slugify";

describe("id utils", () => {
  it("generates prefixed ids", () => {
    const id = generateId("usr");
    expect(id.startsWith("usr_")).toBe(true);
  });

  it("generates order numbers in ATE-YYYY-NNNNNN format", () => {
    const orderNumber = generateOrderNumber();
    expect(orderNumber).toMatch(/^ATE-\d{4}-\d{6}$/);
  });

  it("generates references with a prefix", () => {
    const ref = generateReference("pay");
    expect(ref.startsWith("pay_")).toBe(true);
    expect(ref.length).toBeGreaterThan("pay_".length);
  });

  it("generates upper-cased SKUs", () => {
    expect(generateSKU()).toMatch(/^ATE-[A-Z0-9_-]{8}$/);
  });

  it("sluggifies accents and spaces", () => {
    expect(slugify("  Oversized Graphic Tee  ")).toBe("oversized-graphic-tee");
    expect(generateUniqueSlug("")).toMatch(/^item-/);
  });
});
