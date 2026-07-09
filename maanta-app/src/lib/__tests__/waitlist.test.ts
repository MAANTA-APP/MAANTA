import { describe, expect, it } from "vitest";
import {
  CONSENT_TEXT,
  DEFAULT_NODE_INTEREST,
  normalizeEmail,
  normalizePhone,
  validateWaitlistSignup,
} from "../waitlist";

const shopperPayload = {
  segmentType: "shopper",
  email: "Aisha@Example.com",
  phone: "0712 345 678",
  city: "Nairobi",
  consent: true,
};

describe("normalizePhone", () => {
  it("normalizes Kenyan local format to +254", () => {
    expect(normalizePhone("0712 345 678")).toBe("+254712345678");
    expect(normalizePhone("0110123456")).toBe("+254110123456");
  });

  it("normalizes 254 / +254 forms", () => {
    expect(normalizePhone("254712345678")).toBe("+254712345678");
    expect(normalizePhone("+254-712-345-678")).toBe("+254712345678");
  });

  it("accepts generic international E.164", () => {
    expect(normalizePhone("+447911123456")).toBe("+447911123456");
  });

  it("rejects garbage", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
    expect(normalizePhone("0812345678")).toBeNull(); // not a Kenyan mobile prefix
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Aisha@Example.COM ")).toBe("aisha@example.com");
  });

  it("rejects malformed addresses", () => {
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("a b@example.com")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});

describe("validateWaitlistSignup", () => {
  it("accepts a minimal shopper signup and applies defaults", () => {
    const result = validateWaitlistSignup(shopperPayload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.segment_type).toBe("shopper");
    expect(result.row.email).toBe("aisha@example.com");
    expect(result.row.phone).toBe("+254712345678");
    expect(result.row.node_interest).toBe(DEFAULT_NODE_INTEREST);
    expect(result.row.consent_text).toBe(CONSENT_TEXT);
    expect(result.row.business_name).toBeNull();
    expect(result.row.mall_name).toBeNull();
  });

  it("captures UTM attribution when present", () => {
    const result = validateWaitlistSignup({
      ...shopperPayload,
      utmCampaign: "prelaunch-week1",
      utmMedium: "paid_social",
      utmSource: "instagram",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.source_campaign).toBe("prelaunch-week1");
    expect(result.row.source_medium).toBe("paid_social");
    expect(result.row.source_channel).toBe("instagram");
  });

  it("rejects missing consent", () => {
    const result = validateWaitlistSignup({ ...shopperPayload, consent: false });
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("consent"),
    });
  });

  it("rejects unknown segments", () => {
    const result = validateWaitlistSignup({
      ...shopperPayload,
      segmentType: "investor",
    });
    expect(result.ok).toBe(false);
  });

  it("flags honeypot submissions", () => {
    const result = validateWaitlistSignup({
      ...shopperPayload,
      website: "https://spam.example",
    });
    expect(result).toEqual({ ok: false, error: "honeypot" });
  });

  it("requires merchant business fields for the merchant segment", () => {
    const missing = validateWaitlistSignup({
      ...shopperPayload,
      segmentType: "merchant",
    });
    expect(missing.ok).toBe(false);

    const result = validateWaitlistSignup({
      ...shopperPayload,
      segmentType: "merchant",
      businessName: "Mama Njeri Fashion",
      businessCategory: "Fashion",
      floorUnit: "2nd floor, Unit 24",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.business_name).toBe("Mama Njeri Fashion");
    expect(result.row.business_category).toBe("Fashion");
    expect(result.row.floor_unit).toBe("2nd floor, Unit 24");
  });

  it("requires mall fields for the mall_operator segment", () => {
    const missing = validateWaitlistSignup({
      ...shopperPayload,
      segmentType: "mall_operator",
      mallName: "Two Rivers",
    });
    expect(missing.ok).toBe(false);

    const result = validateWaitlistSignup({
      ...shopperPayload,
      segmentType: "mall_operator",
      mallName: "Two Rivers",
      mallRole: "Leasing manager",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.mall_name).toBe("Two Rivers");
    expect(result.row.mall_role).toBe("Leasing manager");
  });

  it("ignores merchant fields on non-merchant segments", () => {
    const result = validateWaitlistSignup({
      ...shopperPayload,
      businessName: "Should be ignored",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.business_name).toBeNull();
  });

  it("caps overlong free-text fields", () => {
    const result = validateWaitlistSignup({
      ...shopperPayload,
      fullName: "x".repeat(1000),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.full_name?.length).toBe(200);
  });
});
