/**
 * YOU PAY — the price policy from maanta-design-brief §4.
 *
 * YOU PAY = deal price + every disclosed extra, summed. It is the single exact
 * amount the shopper hands over; the shopper never does arithmetic. Extras are
 * summarised as ONE line ("Includes KES 122 in taxes and charges") everywhere
 * except deal detail, where the itemised breakdown is shown because that is
 * where the shopper is deciding, not paying.
 *
 * This module is the ONE place YOU PAY is computed, so the tile, the deal
 * detail and the claimed code can never disagree (a disagreement is the product
 * lying about a price).
 */

export type DealChargeType = "fixed" | "percent";

export type DealCharge = {
  /** Human label shown in the itemised breakdown, e.g. "VAT (16%)". */
  label: string;
  /** "fixed" = flat KES; "percent" = a percentage of the deal price. */
  type: DealChargeType;
  /** KES amount when fixed, percentage points when percent. */
  value: number;
};

/** Resolve a single charge to whole KES against the deal price. */
export function chargeAmount(charge: DealCharge, priceKes: number): number {
  const raw =
    charge.type === "percent" ? (priceKes * charge.value) / 100 : charge.value;
  return Math.round(raw);
}

/** Total of all disclosed extras, in whole KES. */
export function extrasTotal(charges: DealCharge[], priceKes: number): number {
  return charges.reduce((sum, c) => sum + chargeAmount(c, priceKes), 0);
}

/**
 * The exact amount the shopper pays, or null when the deal has no published
 * price (legacy deals). Rounded to whole KES — the number is a promise, not a
 * subtotal.
 */
export function youPay(
  priceKes: number | null | undefined,
  charges: DealCharge[] = []
): number | null {
  if (priceKes == null || Number.isNaN(priceKes)) return null;
  return Math.round(priceKes) + extrasTotal(charges, priceKes);
}

/** Parse a raw JSON value from the DB into a clean, validated charge list. */
export function parseCharges(raw: unknown): DealCharge[] {
  if (!Array.isArray(raw)) return [];
  const out: DealCharge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const label = typeof c.label === "string" ? c.label.trim() : "";
    const type = c.type === "percent" ? "percent" : "fixed";
    const value = typeof c.value === "number" ? c.value : Number(c.value);
    if (!label || !Number.isFinite(value) || value <= 0) continue;
    out.push({ label, type, value });
  }
  return out;
}

/**
 * Resolve a deal row's shopper pricing in one place — the tile, deal detail and
 * claimed code all read from this, so the number is identical everywhere.
 */
export function dealPricing(deal: {
  price_kes: number | null;
  compare_at_kes: number | null;
  charges: unknown;
}): {
  pay: number | null;
  was: number | null;
  extras: number;
  charges: DealCharge[];
} {
  const charges = parseCharges(deal.charges);
  const pay = youPay(deal.price_kes, charges);
  const was =
    deal.compare_at_kes != null && pay != null && deal.compare_at_kes > pay
      ? deal.compare_at_kes
      : null;
  const extras = deal.price_kes != null ? extrasTotal(charges, deal.price_kes) : 0;
  return { pay, was, extras, charges };
}

/** "Includes KES 122 in taxes and charges" — the one-line extras summary. */
export function extrasSummary(
  priceKes: number | null | undefined,
  charges: DealCharge[] = []
): string | null {
  if (priceKes == null) return null;
  const total = extrasTotal(charges, priceKes);
  if (total <= 0) return null;
  return `Includes KES ${total.toLocaleString("en-KE")} in taxes and charges`;
}
