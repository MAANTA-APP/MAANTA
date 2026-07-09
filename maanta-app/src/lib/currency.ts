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

// Used only if the live FX provider is unreachable/slow/malformed. Values
// are deliberately approximate — this path existing at all is a signal
// something's wrong with FX_PROVIDER_URL and should be looked into, not a
// long-term rate source.
const FALLBACK_KES_RATE: Record<SupportedCurrency, number> = {
  KES: 1,
  USD: 129,
  EUR: 140,
  GBP: 163,
};

// Keyless, no-signup FX provider (open.er-api.com, backed by
// exchangerate-api.com's free tier). Before going live with real non-KES
// charges, replace this with a paid/SLA-backed provider and disclose the
// rate source + any margin in legal/refund-and-wallet-policy.md.
const FX_PROVIDER_URL = "https://open.er-api.com/v6/latest/KES";
const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FX_FETCH_TIMEOUT_MS = 5000;

let cachedRatesFromKes: { fetchedAt: number; rates: Record<string, number> } | null = null;

async function getRatesFromKes(): Promise<Record<string, number> | null> {
  if (cachedRatesFromKes && Date.now() - cachedRatesFromKes.fetchedAt < FX_CACHE_TTL_MS) {
    return cachedRatesFromKes.rates;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FX_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FX_PROVIDER_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`FX provider returned ${res.status}`);
    const body = await res.json();
    const rates = body?.rates;
    if (!rates || typeof rates.USD !== "number") {
      throw new Error("FX provider returned an unexpected response shape");
    }
    cachedRatesFromKes = { fetchedAt: Date.now(), rates };
    return rates;
  } catch (err) {
    console.error("Live FX rate fetch failed, using fallback rates:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Converts `amount` in `currency` to its KES equivalent, using live rates
// (cached for FX_CACHE_TTL_MS) with a static fallback if the provider is
// unreachable, so a top-up never hard-fails just because the FX API is down.
export async function toKes(
  amount: number,
  currency: SupportedCurrency
): Promise<number> {
  if (currency === "KES") return amount;

  const ratesFromKes = await getRatesFromKes();
  const currencyPerKes = ratesFromKes?.[currency];

  if (typeof currencyPerKes === "number" && currencyPerKes > 0) {
    return amount / currencyPerKes;
  }

  return amount * FALLBACK_KES_RATE[currency];
}
