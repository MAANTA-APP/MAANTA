import { describe, it, expect } from "vitest";
import {
  COUNTER_STAFF_OPTIONS,
  MERCHANT_CATEGORIES,
  MERCHANT_CONTACT_CONSENT_TEXT,
  validateMerchantInterest,
} from "@/lib/merchant-interest";
import { FACTS } from "@/lib/marketing/facts";

const valid = {
  shopName: "Amina's Shoes",
  contactName: "Amina",
  phone: "0712 345 678",
  mall: "bbs",
  floor: "GF",
  unit: " 12 ",
  category: MERCHANT_CATEGORIES[1],
  counterStaff: "two_to_four",
  eliteTrial: true,
  contactConsent: true,
};

describe("validateMerchantInterest", () => {
  it("accepts a valid submission and normalizes the phone and the unit", () => {
    const r = validateMerchantInterest(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.phone).toBe("+254712345678");
    expect(r.data.unit).toBe("12");
    expect(r.data.mall).toBe(FACTS.candidateMall);
    expect(r.data.floor).toBe("GF");
    expect(r.data.counterStaff).toBe("two_to_four");
    expect(r.data.eliteTrialOptIn).toBe(true);
    expect(r.data.isTest).toBe(false);
  });

  // No email, deliberately: the merchant is reached on WhatsApp, and nothing
  // here goes to the email platform. The one form where "phone first, email
  // never" holds without a caveat.
  it("never asks for or reads an email", () => {
    const r = validateMerchantInterest({ ...valid, email: "x@example.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect("email" in r.data).toBe(false);
  });

  it("requires the shop, the person, a real number, a floor and a unit", () => {
    expect(validateMerchantInterest({ ...valid, shopName: " " }).ok).toBe(false);
    expect(validateMerchantInterest({ ...valid, contactName: "" }).ok).toBe(false);
    expect(validateMerchantInterest({ ...valid, phone: "12" }).ok).toBe(false);
    expect(validateMerchantInterest({ ...valid, floor: "3F" }).ok).toBe(false);
    expect(validateMerchantInterest({ ...valid, unit: "" }).ok).toBe(false);
  });

  it("requires contact consent, and records the wording the merchant saw", () => {
    expect(validateMerchantInterest({ ...valid, contactConsent: false }).ok).toBe(false);
    expect(validateMerchantInterest({ ...valid, contactConsent: "yes" }).ok).toBe(false);
    expect(MERCHANT_CONTACT_CONSENT_TEXT.length).toBeGreaterThan(20);
  });

  it("takes another mall by name, and refuses 'other' with no name", () => {
    const named = validateMerchantInterest({ ...valid, mall: "other", mallOther: " Garden City " });
    expect(named.ok && named.data.mall).toBe("Garden City");
    expect(validateMerchantInterest({ ...valid, mall: "other", mallOther: "" }).ok).toBe(false);
  });

  it("drops an unknown category or counter size rather than storing free text", () => {
    const r = validateMerchantInterest({ ...valid, category: "Drugs", counterStaff: "lots" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.category).toBeNull();
    expect(r.data.counterStaff).toBeNull();
    expect(COUNTER_STAFF_OPTIONS.map((o) => o.value)).toEqual(["just_me", "two_to_four", "five_plus"]);
  });

  // Same contract as the waitlist: the body can never mark itself as a test.
  it("ignores isTest in the body and honours the verified verdict only", () => {
    const sneaky = validateMerchantInterest({ ...valid, isTest: true, testLabel: "x" });
    expect(sneaky.ok && sneaky.data.isTest).toBe(false);
    expect(sneaky.ok && sneaky.data.testLabel).toBeNull();
    const verified = validateMerchantInterest({ ...valid, testLabel: "smoke" }, { isTest: true });
    expect(verified.ok && verified.data.isTest).toBe(true);
    expect(verified.ok && verified.data.testLabel).toBe("smoke");
  });
});
