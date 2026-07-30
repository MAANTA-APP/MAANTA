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
    expect(read("src/app/(shopper)/deals/[id]/page.tsx")).toMatch(/You pay/);
  });

  it("merchant success takeover states the cash is collected in person, not in-app", () => {
    expect(read("src/components/ui/redemption-result.tsx")).toMatch(
      /not an in-app charge/
    );
  });
});

describe("key user-facing copy is locked", () => {
  it("feed empty state copy", () => {
    expect(read("src/app/(shopper)/feed/page.tsx")).toContain(
      "No deals live right now"
    );
  });

  it("feed error state copy (retryable, not empty)", () => {
    expect(read("src/app/(shopper)/feed/error.tsx")).toContain(
      "We couldn't load deals — try again in a moment."
    );
  });

  it("verify-phone heading, success line, and resend cooldown", () => {
    const src = read("src/app/verify-phone/page.tsx");
    // Contract frame 13f (design/current-reality/frames.json) declares this
    // heading, and the design-truth smoke suite asserts it by ARIA role. Both
    // must move together — see docs/design-truth-protocol.md.
    expect(src).toContain("Verify your phone");
    expect(src).toContain("Phone verified");
    expect(src).toMatch(/Resend code in \$\{resendIn\}s/);
  });

  it("merchant redeem keeps the calm-cancel and code-valid copy", () => {
    const src = read("src/app/merchant/(app)/redeem/redeem-keypad.tsx");
    expect(src).toContain("Cancel — charges nothing");
    expect(src).toContain("Code valid");
  });
});

/**
 * R-PLAN-NAMES (frozen): plans are **Standard** and **Elite**, never "Free".
 *
 * Both public plan cards used to render the Standard plan's PRICE as "Free",
 * which brushes the frozen rule and, worse, misstates the model — Standard
 * carries the KES 30 success fee, which is the entire business. "No monthly fee"
 * is accurate and is the phrasing the for-merchants bullet list already used.
 *
 * Contract: design/current-reality/frames.json → frame 12e, runtimeRule
 * R-PLAN-NAMES.
 */
describe("R-PLAN-NAMES — plan naming and pricing copy", () => {
  const PLAN_PAGES = [
    "src/app/(public)/pricing/page.tsx",
    "src/app/(public)/for-merchants/page.tsx",
  ];

  it.each(PLAN_PAGES)("%s names both plans", (path) => {
    const src = read(path);
    expect(src).toContain("Standard");
    expect(src).toContain("Elite");
  });

  it.each(PLAN_PAGES)("%s never prices a plan as 'Free'", (path) => {
    const src = read(path);
    // Matches a price/heading rendering of the bare word, e.g. `>Free<`.
    expect(src).not.toMatch(/>\s*Free\s*</);
  });

  it("carries no ungoverned launch-offer promise on any public page", () => {
    // Founder decision 2026-07-29 (drift D-12): the "first month of Elite free"
    // line was withdrawn because nothing backed it — no decisions-log entry and
    // no app_config key, so nothing reconciled the promise against what an Elite
    // trial actually grants. A future offer must be config/policy-backed before
    // it is re-advertised, and this test is what makes re-adding one deliberate.
    //
    // Comments are stripped first, so the explanatory comment left at the
    // removal site does not satisfy or trip this check.
    const PROMISE = /launch offer|first month[^.]{0,30}free|month of elite free|free month/i;
    for (const path of [
      "src/app/(public)/pricing/page.tsx",
      "src/app/(public)/for-merchants/page.tsx",
      "src/app/(public)/page.tsx",
    ]) {
      const withoutComments = read(path)
        .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(withoutComments, `${path} advertises an ungoverned offer`).not.toMatch(
        PROMISE
      );
    }
  });

  it("never describes the Standard plan itself as free", () => {
    // "stays free on Standard" was the last instance: Standard carries the
    // KES 30 success fee, so no copy may call the plan free.
    for (const path of PLAN_PAGES) {
      expect(read(path), path).not.toMatch(/free on Standard|Standard[^.]{0,20}\bis free\b/i);
    }
  });

  it("reads the launch credit from config instead of hardcoding the promise", () => {
    // The Node 0 opening credit is gated live by activate_merchant on four
    // app_config keys. The page used to hardcode the amount and the cap, so the
    // promise outlived every one of those gates. Both promo blocks must now be
    // conditional on the gate, and the numbers must come from it.
    const src = read("src/app/(public)/for-merchants/page.tsx");
    expect(src).toContain("getLaunchCreditOffer");
    expect(src).not.toMatch(/const OPENING_CREDIT/);
    expect(src).not.toMatch(/First 100 shops|KES 300/);
    // Hero pill and the promo card — neither may render unconditionally.
    expect(src.match(/offer\.live/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("keeps the frozen numbers on the pricing page", () => {
    const src = read("src/app/(public)/pricing/page.tsx");
    expect(src).toContain("KES 30");
    expect(src).toContain("KES 3,500");
    // The success fee must stay visible next to the Standard plan, so "no
    // monthly fee" can never read as "costs nothing".
    expect(src).toMatch(/No monthly fee/);
    expect(src).toMatch(/success fee per verified redemption/);
  });
});
