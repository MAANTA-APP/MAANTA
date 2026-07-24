import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RedemptionResult } from "@/components/ui/redemption-result";

// P12 — the merchant success takeover must tell the cashier how much to COLLECT
// FROM THE SHOPPER (the YOU PAY total snapshotted at claim as
// redemptions.amount_kes), separate from the KES 30 MAANTA success fee.
// RedemptionResult is a pure presentational component, so we render it to
// static markup (no jsdom, no JSX — createElement) and assert the collect
// line's presence/absence and that money stays white/ink, never amber (R3).

type Props = Parameters<typeof RedemptionResult>[0];

const base: Props = {
  feeAmount: 30,
  newBalance: 510,
  feeChargeStatus: "charged",
  referenceId: "8f2c1a90-0000-0000-0000-000000000000",
  disputed: false,
  countdown: 3,
};

const render = (props: Props) =>
  renderToStaticMarkup(createElement(RedemptionResult, props));

describe("RedemptionResult — P12 collect-from-shopper", () => {
  it("shows the YOU PAY amount to collect when amount_kes is present", () => {
    const html = render({ ...base, amountKes: 572 });
    expect(html).toContain("Collect from shopper");
    expect(html).toContain("KES 572");
  });

  it("keeps the collect amount distinct from the KES 30 success fee", () => {
    const html = render({ ...base, amountKes: 572 });
    expect(html).toContain("Collect from shopper");
    expect(html).toContain("success fee");
    expect(html).toContain("KES 30");
  });

  it("omits the collect line for legacy deals with no snapshot (null)", () => {
    const html = render({ ...base, amountKes: null });
    expect(html).not.toContain("Collect from shopper");
  });

  it("omits the collect line for a non-positive amount", () => {
    expect(render({ ...base, amountKes: 0 })).not.toContain("Collect from shopper");
    expect(render({ ...base, amountKes: -1 })).not.toContain("Collect from shopper");
    expect(render({ ...base, amountKes: undefined })).not.toContain(
      "Collect from shopper"
    );
  });

  it("renders the collect AMOUNT itself in white, never amber (R3: money never coloured)", () => {
    const html = render({ ...base, amountKes: 572 });
    // Target the collect-amount node directly (text-white also appears on the
    // icon/header), and prove it isn't amber.
    expect(html).toMatch(/<p class="[^"]*\btext-white\b[^"]*">KES 572<\/p>/);
    expect(html).not.toContain("text-brand");
  });

  it("still shows the arrears wording on the owed path, alongside the collect line", () => {
    const html = render({ ...base, feeChargeStatus: "owed", amountKes: 572 });
    expect(html).toContain("Collect from shopper");
    expect(html).toContain("arrears");
  });
});
