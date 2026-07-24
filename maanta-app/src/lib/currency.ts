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

// Live rates come from the pluggable FX provider (src/lib/fx). Swapping the
// provider (keyless open.er-api.com → a paid/SLA-backed source before real
// non-KES charges) is a call to configureFxProvider() and changes nothing here.
import { ratesFromKes } from "@/lib/fx";

// Used only if the live FX provider is unreachable/slow/malformed. Values
// are deliberately approximate — this path existing at all is a signal
// something's wrong with the FX provider and should be looked into, not a
// long-term rate source.
const FALLBACK_KES_RATE: Record<SupportedCurrency, number> = {
  KES: 1,
  USD: 129,
  EUR: 140,
  GBP: 163,
};

// Converts `amount` in `currency` to its KES equivalent, using the active FX
// provider's live rates (cached in src/lib/fx) with the static fallback above
// if the provider is unreachable, so a top-up never hard-fails just because
// the FX API is down.
export async function toKes(
  amount: number,
  currency: SupportedCurrency
): Promise<number> {
  if (currency === "KES") return amount;

  const rates = await ratesFromKes();
  const currencyPerKes = rates?.[currency];

  if (typeof currencyPerKes === "number" && currencyPerKes > 0) {
    return amount / currencyPerKes;
  }

  return amount * FALLBACK_KES_RATE[currency];
}
