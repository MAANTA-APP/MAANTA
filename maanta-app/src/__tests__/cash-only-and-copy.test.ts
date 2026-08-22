import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Guardrails, not renders: MAANTA never charges the shopper in-app. This scans
// the shopper + merchant-redeem screens for any UI that could be misread as an
// in-app payment (checkout / card entry / "pay now"), and locks the key
// user-facing copy so future edits to these strings are deliberate. Fast,
// dependency-free, and hard to accidentally regress.

const root = process.cwd(); // maanta-app
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8");

const SHOPPER_AND_REDEEM = [
  "src/app/(shopper)/feed/page.tsx",
  "src/app/(shopper)/feed/error.tsx",
  "src/app/(shopper)/deals/[id]/page.tsx",
  "src/app/(shopper)/deals/[id]/claim-flow.tsx",
  "src/app/(shopper)/tickets/[id]/page.tsx",
  "src/app/(shopper)/tickets/[id]/claimed-code.tsx",
  "src/app/verify-phone/page.tsx",
  "src/app/merchant/(app)/redeem/page.tsx",
  "src/app/merchant/(app)/redeem/redeem-keypad.tsx",
  "src/components/ui/redemption-result.tsx",
  "src/components/ui/otp-input.tsx",
  "src/components/ui/wallet-header.tsx",
];

// Payment-UI phrases — NOT the bare word "pay" ("You pay KES N" is the shopper's
// cash amount and is allowed).
const FORBIDDEN: RegExp[] = [
  /checkout/i,
  /\badd (a )?card\b/i,
  /card number/i,
  /\bpay now\b/i,
  /pay (with|by) card/i,
  /credit card/i,
  /debit card/i,
  /enter (your )?card/i,
  /in-app payment/i,
];

describe("cash-only guardrail — no in-app shopper payment UI", () => {
  for (const file of SHOPPER_AND_REDEEM) {
    it(`${file} contains no payment-UI phrasing`, () => {
      const src = read(file);
      for (const rx of FORBIDDEN) {
        expect(src, `${file} unexpectedly matches ${rx}`).not.toMatch(rx);
      }
    });
  }

  it("shopper deal detail frames money as 'You pay' (cash), not a charge", () => {
    // Both halves of the screen: the body figure (shown when the deal cannot
    // be claimed) and the anchored decision bar (the default, claimable view).
    // Reading only the page would leave the surface most shoppers see
    // uncovered — Direction A slice 3 moved the figure into the bar.
    expect(read("src/app/(shopper)/deals/[id]/page.tsx")).toMatch(/You pay/);
    expect(read("src/app/(shopper)/deals/[id]/claim-flow.tsx")).toMatch(/You pay/);
  });

  it("merchant success takeover states the cash is collected in person, not in-app", () => {
    expect(read("src/components/ui/redemption-result.tsx")).toMatch(
      /not an in-app charge/
    );
  });
});

describe("key user-facing copy is locked", () => {
  it("feed empty state copy", () => {
    // The string moved out of the page on 2026-08-18: the feed now has three
    // empty states, not one, and choosing between them is logic worth testing
    // as logic (`deal-categories.test.ts`), so it lives in its own module. This
    // guard follows the copy rather than the file — "the mall is quiet" is still
    // the sentence a shopper reads when nothing is live, which is what it locks.
    expect(read("src/lib/feed-empty-state.ts")).toContain("No deals live right now");
  });

  it("feed error state copy (retryable, not empty)", () => {
    expect(read("src/app/(shopper)/feed/error.tsx")).toContain(
      "We couldn't load deals — try again in a moment."
    );
  });

  it("verify-phone heading, success line, and resend cooldown", () => {
    const src = read("src/app/verify-phone/page.tsx");
    expect(src).toContain("Add your phone to claim");
    expect(src).toContain("Phone verified");
    expect(src).toMatch(/Resend code in \$\{resendIn\}s/);
  });

  it("merchant redeem keeps the calm-cancel and code-valid copy", () => {
    const src = read("src/app/merchant/(app)/redeem/redeem-keypad.tsx");
    expect(src).toContain("Cancel — charges nothing");
    expect(src).toContain("Code valid");
  });
});
