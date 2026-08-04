import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, needsRehash } from "@/utils/password";

describe("password utils", () => {
  it("round-trips a password through hash + verify", async () => {
    const hash = await hashPassword("Sup3r-Secure-Pass!");
    expect(hash).toContain("$argon2");
    expect(await verifyPassword(hash, "Sup3r-Secure-Pass!")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("produces a unique salt per call", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("reports rehash need with non-default params", async () => {
    const weak = await hashPassword("x", { memoryCost: 8192, timeCost: 2 });
    expect(await needsRehash(weak)).toBe(true);
  });
});
