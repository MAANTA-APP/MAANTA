import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

import { TopupFlow } from "../topup-flow";

/**
 * Top-up settlement states — a MONEY-PATH correctness test, not a copy test.
 *
 * The bug this pins: returning from Stripe Checkout with `?stripe=success`
 * rendered a success tick and "Top-up received" while the wallet balance was
 * unchanged. The merchant had paid; the money had **not** been credited (that
 * happens when the webhook lands). Telling a merchant their wallet is topped up
 * before it is, is the same class of error as charging before an outcome is
 * known — it invites a second payment and it makes the balance a lie.
 *
 * The rule, stated once: **only a balance that has actually risen may be
 * described as credited.** Everything before that is pending, and a card payment
 * that fails to settle inside the wait window is still pending — never failed,
 * because it already cleared Checkout.
 *
 * Rendered to static markup (node env, no jsdom), so these assert the state the
 * merchant lands on. Effects (the wallet poll) do not run under SSR, which is
 * exactly right here: the initial state is the thing that used to lie.
 */
const base = {
  balance: 500,
  merchantPhone: "+254700000000",
  initialAmount: 3000,
};

function render(stripeResult: string | null) {
  return renderToStaticMarkup(createElement(TopupFlow, { ...base, stripeResult }));
}

describe("top-up settlement states", () => {
  describe("returning from Stripe Checkout (?stripe=success)", () => {
    const html = render("success");

    it("never claims the money landed", () => {
      // The regression, stated as plainly as possible.
      expect(html).not.toContain("Top-up received");
      expect(html).not.toContain("added");
      expect(html).not.toContain("New balance");
    });

    it("says the wallet is not credited yet, and says it persistently", () => {
      expect(html).toContain("Confirming your payment");
      expect(html).toContain("Not credited yet.");
      // A persistent inline surface, never a toast — money states must survive
      // being ignored for a minute.
      expect(html).toContain("role=\"alert\"");
    });

    it("tells the merchant not to pay twice", () => {
      // They have already paid. Dropping them on the top-up form invites a
      // second payment for the same money.
      expect(html).toContain("Don&#x27;t pay again");
      expect(html).not.toContain("Send STK push");
      expect(html).not.toContain("Pay by card");
    });
  });

  describe("returning cancelled (?stripe=cancelled)", () => {
    const html = render("cancelled");

    it("is the one return state that may say no money moved", () => {
      // Cancelling at Checkout means no charge was made — this is knowable, so
      // it is safe to state.
      expect(html).toContain("Top-up not completed");
      expect(html).toContain("No money left your account");
    });

    it("does not claim a credit", () => {
      expect(html).not.toContain("New balance");
    });
  });

  describe("the amount form (no Stripe return)", () => {
    const html = render(null);

    it("offers card as the primary rail while IntaSend is not live (R-STRIPE-PHASE-1)", () => {
      // TODO(D-06) is the reorder marker; until M-Pesa STK is live, card is the
      // only rail that can complete, so it carries the single amber action.
      expect(html).toContain("Pay by card");
      expect(html).toContain("Send STK push");
      // Card must come first in document order.
      expect(html.indexOf("Pay by card")).toBeLessThan(html.indexOf("Send STK push"));
    });

    it("suggests the frozen KES 3,000 top-up", () => {
      expect(html).toContain("3,000");
    });

    it("promises a balance change only on settlement", () => {
      expect(html).toContain("Your balance updates when the payment settles.");
    });
  });
});
