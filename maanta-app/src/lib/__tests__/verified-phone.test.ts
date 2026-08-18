import { describe, it, expect } from "vitest";
import { verifiedPrimaryPhone } from "@/lib/auth";

/**
 * `public.users.phone` is the column getMerchantContext links a pre-invited
 * merchant_staff seat on, so provisioning must persist it only when Clerk has
 * verified the number (D118). This pins the one rule that makes that safe.
 */
describe("verifiedPrimaryPhone", () => {
  it("returns the number when the primary phone is verified", () => {
    expect(
      verifiedPrimaryPhone({
        primaryPhoneNumber: { phoneNumber: "+254712345678", verification: { status: "verified" } },
      })
    ).toBe("+254712345678");
  });

  it("returns null when the primary phone is unverified", () => {
    expect(
      verifiedPrimaryPhone({
        primaryPhoneNumber: { phoneNumber: "+254712345678", verification: { status: "unverified" } },
      })
    ).toBeNull();
  });

  it("returns null when verification is missing entirely", () => {
    expect(
      verifiedPrimaryPhone({ primaryPhoneNumber: { phoneNumber: "+254712345678" } })
    ).toBeNull();
    expect(
      verifiedPrimaryPhone({ primaryPhoneNumber: { phoneNumber: "+254712345678", verification: null } })
    ).toBeNull();
  });

  it("returns null when there is no primary phone or no user", () => {
    expect(verifiedPrimaryPhone({ primaryPhoneNumber: null })).toBeNull();
    expect(verifiedPrimaryPhone({})).toBeNull();
    expect(verifiedPrimaryPhone(null)).toBeNull();
  });

  it("returns null when a verified entry carries no number", () => {
    expect(
      verifiedPrimaryPhone({ primaryPhoneNumber: { verification: { status: "verified" } } })
    ).toBeNull();
  });
});
