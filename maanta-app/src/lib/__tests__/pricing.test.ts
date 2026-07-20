import { describe, it, expect } from "vitest";
import {
  chargeAmount,
  extrasTotal,
  youPay,
  parseCharges,
  extrasSummary,
  dealPricing,
  type DealCharge,
} from "@/lib/pricing";

// The canonical wireframe example (maanta-design-brief §4):
// deal price 450 + VAT 16% (72) + service 30 + packaging 20 = YOU PAY 572.
const CHARGES: DealCharge[] = [
  { label: "VAT (16%)", type: "percent", value: 16 },
  { label: "Service charge", type: "fixed", value: 30 },
  { label: "Packaging", type: "fixed", value: 20 },
];

describe("pricing — YOU PAY", () => {
  it("resolves a percent charge against the deal price", () => {
    expect(chargeAmount(CHARGES[0], 450)).toBe(72);
  });

  it("sums extras to the disclosed total", () => {
    expect(extrasTotal(CHARGES, 450)).toBe(122);
  });

  it("computes YOU PAY = price + extras", () => {
    expect(youPay(450, CHARGES)).toBe(572);
  });

  it("YOU PAY equals the price when there are no extras", () => {
    expect(youPay(450, [])).toBe(450);
  });

  it("returns null when the deal has no published price", () => {
    expect(youPay(null, CHARGES)).toBeNull();
  });

  it("summarises extras as one line", () => {
    expect(extrasSummary(450, CHARGES)).toBe("Includes KES 122 in taxes and charges");
    expect(extrasSummary(450, [])).toBeNull();
  });

  it("rounds each charge to whole KES independently", () => {
    // 15% of 455 = 68.25 -> 68
    expect(chargeAmount({ label: "x", type: "percent", value: 15 }, 455)).toBe(68);
  });
});

describe("pricing — parseCharges", () => {
  it("drops malformed and non-positive entries", () => {
    const raw = [
      { label: "VAT", type: "percent", value: 16 },
      { label: "", type: "fixed", value: 10 }, // no label
      { label: "Zero", type: "fixed", value: 0 }, // non-positive
      { label: "Str", type: "fixed", value: "30" }, // coercible string
      "garbage",
    ];
    const parsed = parseCharges(raw);
    expect(parsed).toEqual([
      { label: "VAT", type: "percent", value: 16 },
      { label: "Str", type: "fixed", value: 30 },
    ]);
  });

  it("defaults a non-array to empty", () => {
    expect(parseCharges(null)).toEqual([]);
    expect(parseCharges({})).toEqual([]);
  });

  it("rejects excessive percent, fixed amounts, and charge count", () => {
    const tooMany = Array.from({ length: 12 }, (_, i) => ({
      label: `Charge ${i}`,
      type: "fixed",
      value: 10,
    }));
    expect(parseCharges(tooMany)).toHaveLength(10);

    expect(
      parseCharges([{ label: "VAT", type: "percent", value: 101 }])
    ).toEqual([]);
    expect(
      parseCharges([{ label: "Fee", type: "fixed", value: 2_000_000 }])
    ).toEqual([]);
  });
});

describe("pricing — dealPricing", () => {
  it("derives pay, was and extras from a deal row", () => {
    const p = dealPricing({ price_kes: 450, compare_at_kes: 700, charges: CHARGES });
    expect(p.pay).toBe(572);
    expect(p.extras).toBe(122);
    expect(p.was).toBe(700);
  });

  it("hides the struck price when it is not above YOU PAY", () => {
    const p = dealPricing({ price_kes: 450, compare_at_kes: 500, charges: CHARGES });
    // 500 is below YOU PAY 572, so it must not display (never a fake discount).
    expect(p.was).toBeNull();
  });

  it("yields a null price for legacy deals", () => {
    const p = dealPricing({ price_kes: null, compare_at_kes: null, charges: [] });
    expect(p.pay).toBeNull();
  });
});
