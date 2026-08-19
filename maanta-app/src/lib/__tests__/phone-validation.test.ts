import { describe, it, expect } from "vitest";
import {
  isValidKenyanPhone,
  isValidInternationalPhone,
  normalizeKenyanPhone,
  normalizeStaffPhone,
} from "@/lib/phone";

/**
 * The two phone checks, and the line between them.
 *
 * `isValidKenyanPhone` guards the money path (`/api/topup` → M-Pesa STK) and the
 * merchant-authored onboarding wizard. `isValidInternationalPhone` guards the
 * admin-assisted onboarding route alone, where the shop's number is a contact
 * field and a pilot tester may not be in Kenya.
 */
describe("isValidKenyanPhone", () => {
  it("accepts the three shapes it documents", () => {
    expect(isValidKenyanPhone("0712345678")).toBe(true);
    expect(isValidKenyanPhone("+254712345678")).toBe(true);
    expect(isValidKenyanPhone("254712345678")).toBe(true);
  });

  it("tolerates the separators a human types", () => {
    expect(isValidKenyanPhone("0712 345 678")).toBe(true);
    expect(isValidKenyanPhone("+254-712-345-678")).toBe(true);
  });

  it("rejects foreign numbers — which is the point of the split", () => {
    expect(isValidKenyanPhone("+47 969 51 162")).toBe(false);
    expect(isValidKenyanPhone("+20 103 800 6802")).toBe(false);
  });
});

describe("isValidInternationalPhone", () => {
  it("accepts the numbers that were blocking a test shop", () => {
    // Both taken from a real rejected admin onboarding attempt: a Norwegian
    // shop phone and an Egyptian WhatsApp number.
    expect(isValidInternationalPhone("+47 969 51 162")).toBe(true);
    expect(isValidInternationalPhone("+20 103 800 6802")).toBe(true);
  });

  it("still accepts every Kenyan form, so the admin path never got narrower", () => {
    for (const p of ["0712345678", "+254712345678", "254712345678", "0712 345 678"]) {
      expect(isValidInternationalPhone(p), p).toBe(true);
    }
  });

  it("is a check, not a shrug", () => {
    // The junk this is actually likely to catch: a name, a word, a truncated
    // paste, a number with no country code and too few digits to be one.
    expect(isValidInternationalPhone("")).toBe(false);
    expect(isValidInternationalPhone("Zak")).toBe(false);
    expect(isValidInternationalPhone("TOP G")).toBe(false);
    expect(isValidInternationalPhone("")).toBe(false);
    expect(isValidInternationalPhone("+254")).toBe(false);
    expect(isValidInternationalPhone("1234567")).toBe(false);
    expect(isValidInternationalPhone("+254-712-abc-678")).toBe(false);
  });

  it("is a shape check and nothing more — say so rather than imply otherwise", () => {
    // 254712345678999 is fifteen digits, so E.164 admits it and this function
    // does too, even though no such Kenyan subscriber exists. Catching that
    // needs a real numbering-plan library, which is not what guards a contact
    // field on an admin-only form. Pinned so the limitation is a recorded
    // decision rather than a surprise to whoever debugs it later.
    expect(isValidInternationalPhone("+254 712 345 678 999")).toBe(true);
  });

  it("holds the E.164 boundary at 15 digits", () => {
    expect(isValidInternationalPhone(`+${"9".repeat(15)}`)).toBe(true);
    expect(isValidInternationalPhone(`+${"9".repeat(16)}`)).toBe(false);
    expect(isValidInternationalPhone("9".repeat(8))).toBe(true);
    expect(isValidInternationalPhone("9".repeat(7))).toBe(false);
  });
});

/**
 * merchant_staff.phone must be stored in the same E.164 shape Clerk gives
 * users.phone, or getMerchantContext never links the seat. These pin the
 * canonicalisation the staff route relies on.
 */
describe("normalizeKenyanPhone", () => {
  it("collapses every accepted Kenyan spelling to one +254 form", () => {
    for (const p of [
      "0712345678",
      "712345678",
      "254712345678",
      "+254712345678",
      "0712 345 678",
      "+254-712-345-678",
    ]) {
      expect(normalizeKenyanPhone(p), p).toBe("+254712345678");
    }
  });

  it("returns null for non-Kenyan or malformed numbers", () => {
    expect(normalizeKenyanPhone("+47 969 51 162")).toBeNull();
    expect(normalizeKenyanPhone("0812345678")).toBeNull(); // not a 7… mobile
    expect(normalizeKenyanPhone("Zak")).toBeNull();
    expect(normalizeKenyanPhone("")).toBeNull();
  });

  it("agrees exactly with isValidKenyanPhone", () => {
    for (const p of ["0712345678", "+254712345678", "+47 969 51 162", "TOP G", "+254"]) {
      expect(normalizeKenyanPhone(p) !== null, p).toBe(isValidKenyanPhone(p));
    }
  });
});

describe("normalizeStaffPhone", () => {
  it("canonicalises Kenyan mobiles to +254 E.164 so the seat links", () => {
    // The exact bug: a hand-typed local number must become the +254 form Clerk
    // stores, or merchant_staff.phone never equals users.phone.
    expect(normalizeStaffPhone("0712 345 678")).toBe("+254712345678");
    expect(normalizeStaffPhone("254712345678")).toBe("+254712345678");
    expect(normalizeStaffPhone("+254712345678")).toBe("+254712345678");
  });

  it("keeps a plausible international number, with a single leading +", () => {
    expect(normalizeStaffPhone("+47 969 51 162")).toBe("+4796951162");
    expect(normalizeStaffPhone("20 103 800 6802")).toBe("+201038006802");
  });

  it("rejects junk so the owner sees a 400, not a silent unlinkable row", () => {
    expect(normalizeStaffPhone("Zak")).toBeNull();
    expect(normalizeStaffPhone("")).toBeNull();
    expect(normalizeStaffPhone("+254")).toBeNull();
    expect(normalizeStaffPhone("1234567")).toBeNull();
  });

  it("is idempotent — normalising an already-canonical number is a no-op", () => {
    const once = normalizeStaffPhone("0712345678");
    expect(once).toBe("+254712345678");
    expect(normalizeStaffPhone(once!)).toBe(once);
  });
});
