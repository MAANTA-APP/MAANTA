import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

import { TopupFlow } from "../topup-flow";

function render(mpesaAvailable: boolean) {
  return renderToStaticMarkup(
    createElement(TopupFlow, {
      balance: 500,
      merchantPhone: "+254712345678",
      initialAmount: 3000,
      stripeResult: null,
      mpesaAvailable,
    })
  );
}

describe("TopupFlow — Phase 1 Stripe-first honesty", () => {
  it("makes Pay with card the primary CTA", () => {
    const html = render(false);
    expect(html).toContain("data-testid=\"topup-card-primary\"");
    expect(html).toContain("Pay with card");
    expect(html).toContain("Card top-up is the live Phase 1 rail");
  });

  it("hides STK when IntaSend is not configured", () => {
    const html = render(false);
    expect(html).toContain("data-testid=\"topup-mpesa-unavailable\"");
    expect(html).not.toContain("data-testid=\"topup-stk-secondary\"");
    expect(html).not.toContain("Send STK push");
  });

  it("offers STK only as a secondary action when IntaSend is configured", () => {
    const html = render(true);
    expect(html).toContain("data-testid=\"topup-stk-secondary\"");
    expect(html).toContain("Send STK push");
    expect(html).not.toContain("data-testid=\"topup-mpesa-unavailable\"");
    // Primary remains card.
    const cardIdx = html.indexOf("data-testid=\"topup-card-primary\"");
    const stkIdx = html.indexOf("data-testid=\"topup-stk-secondary\"");
    expect(cardIdx).toBeGreaterThan(-1);
    expect(stkIdx).toBeGreaterThan(cardIdx);
  });
});

describe("TopupFlow — the phone prefill (D110)", () => {
  function renderWithPhone(merchantPhone: string) {
    return renderToStaticMarkup(
      createElement(TopupFlow, {
        balance: 500,
        merchantPhone,
        initialAmount: 3000,
        stripeResult: null,
        mpesaAvailable: true,
      })
    );
  }

  it("prefills a Kenyan shop number, which M-Pesa can reach", () => {
    expect(renderWithPhone("+254712345678")).toContain('value="+254712345678"');
  });

  it("leaves the field empty for a shop number M-Pesa cannot reach", () => {
    // Admin-assisted onboarding accepts international shop phones — that field
    // is a contact — while /api/topup validates the submitted number as Kenyan,
    // because a non-Kenyan MSISDN cannot receive an STK push. Seeding the field
    // with a number the next click rejects reads as a broken payment rather
    // than a mismatched contact detail.
    const html = renderWithPhone("+4796951162");
    expect(html).not.toContain("+4796951162");
    expect(html).toContain('value=""');
  });
});
