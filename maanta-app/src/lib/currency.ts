import { kesPerUnit, FALLBACK_KES_PER_UNIT } from "@/lib/fx";

export const SUPPORTED_CURRENCIES = ["KES", "USD", "EUR", "GBP"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase())
  );
}

// Shared bounds for top-up amounts, in whatever currency's own units (KES,
// USD, EUR, GBP — this is a sanity ceiling, not an FX-aware business rule).
// Guards against non-number/NaN/Infinity input and absurd values reaching
// Math.round(amount * 100) — e.g. a value large enough to overflow Stripe's
// integer unit_amount, or a non-numeric value slipping through a loose
// `amount <= 0` check (`"0" <= 0` is true in JS after implicit coercion).
export const MIN_TOPUP_AMOUNT = 1;
export const MAX_TOPUP_AMOUNT = 1_000_000;

export function isValidTopupAmount(amount: unknown): amount is number {
  return (
    typeof amount === "number" &&
    Number.isFinite(amount) &&
    amount >= MIN_TOPUP_AMOUNT &&
    amount <= MAX_TOPUP_AMOUNT
  );
}

// FX now lives behind a provider abstraction in src/lib/fx/** (a live provider
// chained to a static fallback). currency.ts keeps `toKes` as its stable public
// entry point so callers (the Stripe webhook, merchant-ledger) don't change.
// See docs/skills/fx-provider.md.

// Converts `amount` in `currency` to its KES equivalent, using live rates
// (cached in the fx layer) with a static fallback if the provider is
// unreachable, so a top-up never hard-fails just because the FX API is down.
export async function toKes(
  amount: number,
  currency: SupportedCurrency
): Promise<number> {
  if (currency === "KES") return amount;

  // kesPerUnit resolves KES-per-1-unit of `currency` through the provider chain
  // (live → static fallback). The fallback answers for every supported
  // currency, so `rate` is effectively always set; the final guard mirrors the
  // fallback one more time purely defensively so this never returns NaN.
  const rate = await kesPerUnit(currency);
  if (typeof rate === "number" && rate > 0) {
    return amount * rate;
  }
  return amount * FALLBACK_KES_PER_UNIT[currency];
}
