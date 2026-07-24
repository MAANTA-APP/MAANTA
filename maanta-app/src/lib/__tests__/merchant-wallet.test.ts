import { describe, expect, it } from "vitest";
import { shouldPromptTopUp } from "@/lib/merchant-wallet";

// M1 — the deal wizard's top-up CTA must appear only when the merchant can't
// create a deal under the zero-balance gate (balance not > 0), and never for a
// funded wallet.
describe("shouldPromptTopUp (M1 zero-balance CTA condition)", () => {
  it("prompts when the wallet is empty or negative", () => {
    expect(shouldPromptTopUp(0)).toBe(true);
    expect(shouldPromptTopUp(-30)).toBe(true);
  });

  it("does not prompt for any positive balance (even below the KES 30 fee)", () => {
    // Verify-anyway means a low wallet still verifies; the *deal-creation* gate
    // is strictly balance > 0, so KES 1 is enough to publish.
    expect(shouldPromptTopUp(1)).toBe(false);
    expect(shouldPromptTopUp(20)).toBe(false);
    expect(shouldPromptTopUp(3500)).toBe(false);
  });

  it("fails safe (prompts) on NaN-shaped input", () => {
    expect(shouldPromptTopUp(Number.NaN)).toBe(true);
  });
});
