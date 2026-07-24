import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { RedemptionResult } from "../redemption-result";

// The success takeover must tell the merchant how much cash to collect from the
// shopper (the YOU PAY amount, snapshotted at claim), and keep it clearly
// distinct from the KES 30 success fee. Rendered to static markup (node env, no
// jsdom) so we assert on the produced HTML.

const base = {
  feeAmount: 30,
  newBalance: 510,
  feeChargeStatus: "charged" as const,
  referenceId: "red-abc",
  disputed: false,
  countdown: 3,
};

function render(props: { collectAmount?: number | null }) {
  return renderToStaticMarkup(createElement(RedemptionResult, { ...base, ...props }));
}

describe("RedemptionResult — Collect from shopper line", () => {
  it("renders the collect line with the YOU PAY amount when present", () => {
    const html = render({ collectAmount: 2400 });
    expect(html).toContain("Collect from shopper");
    expect(html).toContain("KES 2,400");
  });

  it("keeps the collect amount distinct from the KES 30 success fee", () => {
    const html = render({ collectAmount: 2400 });
    // Both amounts appear, and the fee line keeps its own labelled context so
    // the two are never conflated on the surface.
    expect(html).toContain("Collect from shopper");
    expect(html).toContain("KES 2,400");
    expect(html).toContain("success fee charged");
    expect(html).toContain("KES 30");
  });

  it("omits the line when collectAmount is null (legacy rows with no snapshot)", () => {
    const html = render({ collectAmount: null });
    expect(html).not.toContain("Collect from shopper");
  });

  it("omits the line for a missing or non-positive amount", () => {
    expect(render({}).includes("Collect from shopper")).toBe(false);
    expect(render({ collectAmount: 0 }).includes("Collect from shopper")).toBe(false);
    expect(render({ collectAmount: -5 }).includes("Collect from shopper")).toBe(false);
  });

  it("renders money on the dark success surface in white, never amber (Rule 3)", () => {
    const html = render({ collectAmount: 2400 });
    expect(html).toContain("text-white");
    expect(html).not.toContain("text-brand");
  });
});
