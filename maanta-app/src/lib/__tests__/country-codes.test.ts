import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "../country-codes";

/**
 * The shopper-facing country picker (PhoneField) renders this list everywhere a
 * phone is entered. It regressed once to a 3-country stub (Kenya/Norway/Uganda),
 * which blocked diaspora shoppers on the verify-phone screen — the one screen
 * between a shopper and claiming a deal. These assertions keep it full-width.
 */
describe("COUNTRY_CODES", () => {
  it("defaults to Kenya, pinned first", () => {
    expect(COUNTRY_CODES[0]).toEqual({ name: "Kenya", code: "+254" });
    expect(DEFAULT_COUNTRY_CODE).toBe("+254");
  });

  it("is a full worldwide list, not a launch-market stub", () => {
    expect(COUNTRY_CODES.length).toBeGreaterThan(200);
    const names = COUNTRY_CODES.map((c) => c.name);
    // A spread across regions, including diaspora-relevant markets.
    for (const expected of [
      "Somalia",
      "Uganda",
      "Tanzania",
      "Ethiopia",
      "Nigeria",
      "United States",
      "United Kingdom",
      "Norway",
      "United Arab Emirates",
      "India",
      "China",
      "Brazil",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("has unique names and valid E.164 dial codes", () => {
    const names = COUNTRY_CODES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of COUNTRY_CODES) {
      expect(c.code).toMatch(/^\+\d{1,4}$/);
    }
  });

  it("keeps the rest alphabetical after the Kenya pin", () => {
    const rest = COUNTRY_CODES.slice(1).map((c) => c.name);
    const sorted = [...rest].sort((a, b) => a.localeCompare(b, "en"));
    expect(rest).toEqual(sorted);
  });
});
