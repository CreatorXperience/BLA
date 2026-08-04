import { describe, it, expect } from "vitest";
import { roundMoney, percentage, formatMoney, toNumber } from "@/utils/money";

describe("money utils", () => {
  it("rounds money to 2 decimals", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(19.999)).toBe(20);
  });

  it("computes percentages", () => {
    expect(percentage(25, 100)).toBe(25);
    expect(percentage(1, 0)).toBe(0);
  });

  it("converts Prisma Decimal-ish values to numbers", () => {
    expect(toNumber("42.5")).toBe(42.5);
    expect(toNumber(7)).toBe(7);
    expect(toNumber({ toNumber: () => 3.14 })).toBe(3.14);
  });

  it("formats currency", () => {
    expect(formatMoney(1500, "USD", "en-US")).toContain("$1,500");
  });
});
