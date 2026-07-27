import { describe, expect, it } from "vitest";
import { matchDialCode } from "@/lib/phone/country-codes";
import {
  buildE164,
  isValidE164,
  normalizeToE164,
  parseE164,
  validatePhoneField,
} from "@/lib/phone/e164";

describe("buildE164", () => {
  it("builds UK, Norway, Kenya, and Uganda numbers", () => {
    expect(buildE164("+44", "07912 345678")).toBe("+447912345678");
    expect(buildE164("+47", "912 34 567")).toBe("+4791234567");
    expect(buildE164("+254", "0712 345 678")).toBe("+254712345678");
    expect(buildE164("+256", "0712 345678")).toBe("+256712345678");
  });

  it("strips a leading trunk zero from the local part", () => {
    expect(buildE164("+254", "0712345678")).toBe("+254712345678");
  });
});

describe("isValidE164", () => {
  it("accepts plausible international numbers", () => {
    expect(isValidE164("+447912345678")).toBe(true);
    expect(isValidE164("+4791234567")).toBe(true);
    expect(isValidE164("+254712345678")).toBe(true);
    expect(isValidE164("+256712345678")).toBe(true);
  });

  it("rejects too-short and malformed strings", () => {
    expect(isValidE164("447912345678")).toBe(false);
    expect(isValidE164("+25412")).toBe(false);
    expect(isValidE164("+0123456789")).toBe(false);
    expect(isValidE164("not-a-phone")).toBe(false);
  });
});

describe("normalizeToE164", () => {
  it("normalizes Kenyan local input", () => {
    expect(normalizeToE164("0712345678")).toBe("+254712345678");
  });

  it("passes through valid E.164", () => {
    expect(normalizeToE164("+447912345678")).toBe("+447912345678");
  });
});

describe("parseE164", () => {
  it("splits E.164 into dial code and local number", () => {
    expect(parseE164("+447912345678")).toEqual({
      dialCode: "+44",
      localNumber: "7912345678",
    });
    expect(parseE164("+254712345678")).toEqual({
      dialCode: "+254",
      localNumber: "712345678",
    });
  });
});

describe("matchDialCode", () => {
  it("uses longest-prefix match for shared +1", () => {
    const us = matchDialCode("+12125551234");
    expect(us?.dialCode).toBe("+1");
  });
});

describe("validatePhoneField", () => {
  it("accepts UK, Norway, and Kenya numbers for API bodies", () => {
    expect(validatePhoneField("+447912345678").ok).toBe(true);
    expect(validatePhoneField("+4791234567").ok).toBe(true);
    expect(validatePhoneField("+254712345678").ok).toBe(true);
  });

  it("allows optional empty phone when not required", () => {
    const result = validatePhoneField("", { required: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe("");
  });
});
