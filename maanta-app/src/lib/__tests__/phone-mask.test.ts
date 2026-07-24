import { describe, it, expect } from "vitest";
import { maskPhone } from "@/lib/phone-mask";

// Masking is privacy-critical: the full number must never survive, and the
// masked form must be stable and never reveal more than country code + one
// leading digit + last 3.

describe("maskPhone", () => {
  it("masks a Kenyan E.164 number to '+254 7xx xxx NNN'", () => {
    expect(maskPhone("+254712345678")).toBe("+254 7xx xxx 678");
    expect(maskPhone("+254100000123")).toBe("+254 1xx xxx 123");
  });

  it("accepts a Kenyan number without the leading +", () => {
    expect(maskPhone("254712345678")).toBe("+254 7xx xxx 678");
  });

  it("never leaks the full middle digits", () => {
    const masked = maskPhone("+254712345678")!;
    expect(masked).not.toContain("2345"); // interior digits are gone
    expect(masked.replace(/\D/g, "")).not.toContain("712345678");
  });

  it("masks a long non-Kenyan number to first-2 / last-2, middle hidden", () => {
    const masked = maskPhone("+441234567890")!; // 12 digits
    expect(masked.startsWith("+44")).toBe(true);
    expect(masked.endsWith("90")).toBe(true);
    expect(masked).not.toContain("34567"); // middle masked
    // No more than 4 original digits are ever revealed.
    expect((masked.match(/\d/g) ?? []).join("")).toBe("4490");
  });

  it("returns null for a SHORT generic number instead of leaking most of it", () => {
    // 6–8 digit non-Kenyan numbers would expose too much → omitted entirely.
    expect(maskPhone("123456")).toBeNull();
    expect(maskPhone("12345678")).toBeNull();
  });

  it("returns null for empty, nullish, or too-short input", () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
    expect(maskPhone("")).toBeNull();
    expect(maskPhone("   ")).toBeNull();
    expect(maskPhone("+254")).toBeNull();
    expect(maskPhone("12345")).toBeNull();
  });
});
