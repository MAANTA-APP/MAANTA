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

/**
 * The frozen MAANTA success fee, in KES, charged once per verified redemption on
 * ALL plans (Standard and Elite).
 *
 * The authoritative value lives in `app_config.success_fee_kes` and is read at
 * runtime by `getSuccessFee()`; this is the fallback and the single literal that
 * static/public copy is allowed to render. Public marketing pages cannot await a
 * database read, so they import this instead of writing `30` inline — that way
 * one frozen number cannot appear as three independently-drifting literals
 * across `/pricing`, `/for-merchants` and the config table.
 *
 * Changing this requires a new `docs/maanta-decisions-log.md` entry AND an
 * `app_config` update; `success-fee-copy.test.ts` fails if the two disagree.
 */
export const SUCCESS_FEE_KES = 30;

export type DealChargeType = "fixed" | "percent";

export type DealCharge = {
  /** Human label shown in the itemised breakdown, e.g. "VAT (16%)". */
  label: string;
  /** "fixed" = flat KES; "percent" = a percentage of the deal price. */
  type: DealChargeType;
  /** KES amount when fixed, percentage points when percent. */
  value: number;
};

const MAX_CHARGES = 10;
const MAX_CHARGE_LABEL_LENGTH = 80;
const MAX_FIXED_CHARGE_KES = 1_000_000;
const MAX_PERCENT_CHARGE = 100;

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
    if (out.length >= MAX_CHARGES) break;
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const label =
      typeof c.label === "string" ? c.label.trim().slice(0, MAX_CHARGE_LABEL_LENGTH) : "";
    const type = c.type === "percent" ? "percent" : "fixed";
    const value = typeof c.value === "number" ? c.value : Number(c.value);
    if (!label || !Number.isFinite(value) || value <= 0) continue;
    if (type === "percent" && value > MAX_PERCENT_CHARGE) continue;
    if (type === "fixed" && value > MAX_FIXED_CHARGE_KES) continue;
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

/**
 * "Includes KES 122 in taxes and charges" — the one-line extras summary, from a
 * precomputed extras total in whole KES. Every surface that shows the summary
 * renders this string, so the wording cannot drift between tiles, detail,
 * tickets and the merchant preview.
 */
export function extrasLine(total: number): string {
  return `Includes KES ${total.toLocaleString("en-KE")} in taxes and charges`;
}

/** The one-line extras summary from a price + charge list, or null when there are no extras. */
export function extrasSummary(
  priceKes: number | null | undefined,
  charges: DealCharge[] = []
): string | null {
  if (priceKes == null) return null;
  const total = extrasTotal(charges, priceKes);
  if (total <= 0) return null;
  return extrasLine(total);
}
