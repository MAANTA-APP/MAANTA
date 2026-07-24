import type { FxRateProvider } from "./types";

// Keyless, no-signup FX provider (open.er-api.com, backed by
// exchangerate-api.com's free tier). Before going live with real non-KES
// charges, replace this with a paid/SLA-backed provider and disclose the rate
// source + any margin in legal/refund-and-wallet-policy.md. See
// docs/skills/fx-provider.md.
const FX_PROVIDER_URL = "https://open.er-api.com/v6/latest/KES";
const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FX_FETCH_TIMEOUT_MS = 5000;

let cachedRatesFromKes: { fetchedAt: number; rates: Record<string, number> } | null = null;

/** Test-only: clear the in-memory rate cache between cases. */
export function __resetFxCache(): void {
  cachedRatesFromKes = null;
}

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

/**
 * open.er-api.com returns rates with KES as the base: `rates[X]` is X per 1 KES.
 * We invert to KES per 1 X. Rates are cached for FX_CACHE_TTL_MS; a null return
 * (unreachable/malformed/zero rate) lets the registry fall through to the static
 * fallback, exactly as the previous inline currency.ts logic did.
 */
export const openErApiProvider: FxRateProvider = {
  name: "open.er-api.com",
  async kesPerUnit(currency) {
    if (currency === "KES") return 1;
    const rates = await getRatesFromKes();
    const unitPerKes = rates?.[currency];
    if (typeof unitPerKes === "number" && unitPerKes > 0) {
      return 1 / unitPerKes;
    }
    return null;
  },
};
