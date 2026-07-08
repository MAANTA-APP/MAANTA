export const SUPPORTED_CURRENCIES = ["KES", "USD", "EUR", "GBP"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase())
  );
}

// Static placeholder rates for sandbox/testing only — replace with a live FX
// rate provider (e.g. exchangerate.host, Stripe's own conversion) before
// going live with non-KES currencies.
const KES_RATE: Record<SupportedCurrency, number> = {
  KES: 1,
  USD: 129,
  EUR: 140,
  GBP: 163,
};

export function toKes(amount: number, currency: SupportedCurrency): number {
  return amount * KES_RATE[currency];
}
