export const SUPPORTED_CURRENCIES = ["KES", "USD", "EUR", "GBP"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase())
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
