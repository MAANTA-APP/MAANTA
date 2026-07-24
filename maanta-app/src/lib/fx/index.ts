import type { SupportedCurrency } from "@/lib/currency";
import type { FxRateProvider } from "./types";
import { openErApiProvider } from "./remote";
import { staticFallbackProvider } from "./fallback";

export type { FxRateProvider } from "./types";
export { openErApiProvider, __resetFxCache } from "./remote";
export { staticFallbackProvider, FALLBACK_KES_PER_UNIT } from "./fallback";

/**
 * The default provider chain, tried in order: live rates first, then the static
 * fallback. The fallback answers for every supported currency, so a
 * SupportedCurrency effectively always resolves — the chain degrades instead of
 * failing. To add a provider (e.g. an SLA-backed source), implement
 * `FxRateProvider` and insert it here ahead of the fallback.
 */
const DEFAULT_CHAIN: readonly FxRateProvider[] = [openErApiProvider, staticFallbackProvider];

export function fxProviders(): readonly FxRateProvider[] {
  return DEFAULT_CHAIN;
}

/**
 * KES per 1 unit of `currency`, resolved by trying each provider in `chain` in
 * order and taking the first positive answer. Returns null only if no provider
 * can answer (not expected for a SupportedCurrency, since the fallback always
 * can). `chain` is injectable for tests.
 */
export async function kesPerUnit(
  currency: SupportedCurrency,
  chain: readonly FxRateProvider[] = DEFAULT_CHAIN
): Promise<number | null> {
  for (const provider of chain) {
    const rate = await provider.kesPerUnit(currency);
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) return rate;
  }
  return null;
}
