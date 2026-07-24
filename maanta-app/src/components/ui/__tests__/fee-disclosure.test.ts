import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { FeeDisclosure } from "../fee-disclosure";

// The disclosure shown on the merchant M3 keypad BEFORE the explicit Confirm.
// Verify-anyway (founder ruling G1): a short/empty wallet never blocks the
// redemption — the shortfall is disclosed as arrears and the redemption still
// completes. This locks that the disclosure discloses (and never renders a
// "paused until cleared" gate), and that money stays ink, never colour-coded.

function render(props: { fee: number; balance: number }) {
  return renderToStaticMarkup(createElement(FeeDisclosure, props));
}

describe("FeeDisclosure — verify-anyway (G1)", () => {
  it("shows the flat fee and the wallet balance after, funded case", () => {
    const html = render({ fee: 30, balance: 510 });
    expect(html).toContain("This redemption costs");
    expect(html).toContain("KES 30");
    expect(html).toContain("Wallet balance after");
    // 510 - 30 = 480 remains on the balance.
    expect(html).toContain("KES 480");
  });

  it("discloses arrears when the wallet can't cover the fee — never a hard block", () => {
    const html = render({ fee: 30, balance: 0 });
    expect(html).toContain("arrears");
    expect(html).toContain("settled from your next top-up");
    // The redemption is never described as paused/blocked at the counter.
    expect(html).not.toMatch(/paused until cleared/i);
    expect(html).not.toMatch(/redemption is paused/i);
  });

  it("keeps money in ink, never amber/brand (Rule 3)", () => {
    const html = render({ fee: 30, balance: 0 });
    expect(html).not.toContain("text-brand");
  });
});
