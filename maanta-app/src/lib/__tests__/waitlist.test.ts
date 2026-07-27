import { describe, expect, it } from "vitest";
import {
  normalizeWaitlistPhone,
  validateWaitlistSubmission,
  WAITLIST_SEGMENTS,
} from "@/lib/waitlist";
import { waitlistConfirmationEmail } from "@/lib/waitlist-emails";

const validBody = {
  segment: "shopper",
  fullName: "Amina Yusuf",
  email: "Amina@Example.com",
  phone: "0712 345 678",
  consent: true,
};

describe("normalizeWaitlistPhone", () => {
  it("normalizes Kenyan formats to +254 E.164", () => {
    expect(normalizeWaitlistPhone("0712345678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("0712 345 678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("712345678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("254712345678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("+254712345678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("+2540712345678")).toBe("+254712345678");
    expect(normalizeWaitlistPhone("0110123456")).toBe("+254110123456");
  });

  it("passes through plausible non-Kenyan E.164 numbers", () => {
    expect(normalizeWaitlistPhone("+4791234567")).toBe("+4791234567");
  });

  it("rejects invalid numbers and non-strings", () => {
    expect(normalizeWaitlistPhone("12345")).toBeNull();
    expect(normalizeWaitlistPhone("+254812345678")).toBe("+254812345678");
    expect(normalizeWaitlistPhone("07123")).toBeNull();
    expect(normalizeWaitlistPhone("not a phone")).toBeNull();
    expect(normalizeWaitlistPhone(712345678)).toBeNull();
    expect(normalizeWaitlistPhone(null)).toBeNull();
  });
});

describe("validateWaitlistSubmission", () => {
  it("accepts a valid shopper submission and normalizes email + phone", () => {
    const result = validateWaitlistSubmission(validBody);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segment).toBe("shopper");
      expect(result.data.email).toBe("amina@example.com");
      expect(result.data.phone).toBe("+254712345678");
      expect(result.data.businessName).toBeNull();
    }
  });

  it("accepts merchant and mall_operator segments with optional fields", () => {
    const result = validateWaitlistSubmission({
      ...validBody,
      segment: "mall_operator",
      businessName: "  Garden City  ",
      note: "Interested in a pilot",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segment).toBe("mall_operator");
      expect(result.data.businessName).toBe("Garden City");
      expect(result.data.note).toBe("Interested in a pilot");
    }
  });

  it("rejects unknown or free-text segments", () => {
    for (const segment of ["Shopper", "operator", "", null, undefined]) {
      expect(validateWaitlistSubmission({ ...validBody, segment }).ok).toBe(false);
    }
  });

  it("rejects missing name, invalid email, and invalid phone", () => {
    expect(validateWaitlistSubmission({ ...validBody, fullName: "  " }).ok).toBe(false);
    expect(validateWaitlistSubmission({ ...validBody, email: "not-an-email" }).ok).toBe(false);
    expect(validateWaitlistSubmission({ ...validBody, phone: "12" }).ok).toBe(false);
  });

  it("rejects missing consent", () => {
    expect(validateWaitlistSubmission({ ...validBody, consent: false }).ok).toBe(false);
    expect(validateWaitlistSubmission({ ...validBody, consent: "yes" }).ok).toBe(false);
  });

  it("rejects non-object bodies", () => {
    expect(validateWaitlistSubmission(null).ok).toBe(false);
    expect(validateWaitlistSubmission("hi").ok).toBe(false);
  });
});

describe("waitlistConfirmationEmail", () => {
  it("produces distinct copy per segment", () => {
    const subjects = WAITLIST_SEGMENTS.map(
      (s) => waitlistConfirmationEmail(s, "Amina Yusuf").subject
    );
    expect(new Set(subjects).size).toBe(3);
  });

  it("states the KES 30 success fee plainly in the merchant email", () => {
    const email = waitlistConfirmationEmail("merchant", "Amina Yusuf");
    expect(email.html).toContain("KES 30");
    expect(email.text).toContain("KES 30");
  });

  it("greets by first name and escapes HTML in the name", () => {
    const email = waitlistConfirmationEmail("shopper", "<b>Amina</b> Yusuf");
    expect(email.html).not.toContain("<b>Amina</b>");
    expect(email.html).toContain("&lt;b&gt;Amina&lt;/b&gt;");
    expect(waitlistConfirmationEmail("shopper", "Amina Yusuf").text).toContain("Hi Amina");
  });
});
