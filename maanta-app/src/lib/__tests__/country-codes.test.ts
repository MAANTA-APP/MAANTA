import { describe, expect, it } from "vitest";
import { COUNTRY_OPTIONS, PINNED_ISO2 } from "@/lib/country-codes";

describe("country-codes picker ordering", () => {
  it("pins Kenya, Norway, United Kingdom first, in that order", () => {
    expect(PINNED_ISO2).toEqual(["KE", "NO", "GB"]);
    expect(COUNTRY_OPTIONS.slice(0, 3).map((c) => c.iso2)).toEqual(["KE", "NO", "GB"]);
    expect(COUNTRY_OPTIONS[0]).toMatchObject({ name: "Kenya", dialCode: "+254" });
    expect(COUNTRY_OPTIONS[1]).toMatchObject({ name: "Norway", dialCode: "+47" });
    expect(COUNTRY_OPTIONS[2]).toMatchObject({ name: "United Kingdom", dialCode: "+44" });
  });

  it("sorts the remainder alphabetically by name", () => {
    const rest = COUNTRY_OPTIONS.slice(3).map((c) => c.name);
    const sorted = [...rest].sort((a, b) => a.localeCompare(b, "en"));
    expect(rest).toEqual(sorted);
  });

  it("never repeats a country — pinned entries appear exactly once", () => {
    const iso2s = COUNTRY_OPTIONS.map((c) => c.iso2);
    expect(new Set(iso2s).size).toBe(iso2s.length);
    for (const pin of PINNED_ISO2) {
      expect(iso2s.filter((i) => i === pin)).toHaveLength(1);
    }
  });

  it("is the full list, not a curated subset", () => {
    expect(COUNTRY_OPTIONS.length).toBeGreaterThan(200);
    const names = COUNTRY_OPTIONS.map((c) => c.name);
    for (const expected of ["Uganda", "Tanzania", "United States", "Somalia", "Ethiopia"]) {
      expect(names).toContain(expected);
    }
  });

  it("every dial code is a +-prefixed E.164 calling code", () => {
    for (const c of COUNTRY_OPTIONS) {
      expect(c.dialCode).toMatch(/^\+\d{1,3}$/);
      expect(c.iso2).toMatch(/^[A-Z]{2}$/);
    }
  });
});
