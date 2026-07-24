import type { FxProvider, KesRateMap } from "./types";
import { OpenErApiProvider } from "./open-er-api-provider";

export type { FxProvider, KesRateMap } from "./types";
export { OpenErApiProvider } from "./open-er-api-provider";
export { StaticFxProvider } from "./static-provider";

// 6h cache is plenty for wallet top-ups and keeps us well inside any free-tier
// rate limit; the money path never blocks on a live fetch more than once per
// window.
export const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// The active provider. Launch default is the keyless open.er-api.com source;
// call configureFxProvider() (e.g. at startup, once a paid provider is wired)
// to swap it without changing any caller.
let activeProvider: FxProvider = new OpenErApiProvider();
let cache: { fetchedAt: number; rates: KesRateMap } | null = null;

/** Swap the active FX provider. Clears the cache so the new rates take effect. */
export function configureFxProvider(provider: FxProvider): void {
  activeProvider = provider;
  cache = null;
}

/** The currently active provider (for logging/telemetry/tests). */
export function getActiveFxProvider(): FxProvider {
  return activeProvider;
}

/** Test hook: drop the cached rates without changing the provider. */
export function resetFxCache(): void {
  cache = null;
}

/**
 * Current currency-per-KES rates from the active provider, cached for
 * FX_CACHE_TTL_MS. Returns `null` if the provider fails (callers fall back to
 * static rates). `now` is injectable for deterministic cache tests.
 */
export async function ratesFromKes(now: number = Date.now()): Promise<KesRateMap | null> {
  if (cache && now - cache.fetchedAt < FX_CACHE_TTL_MS) {
    return cache.rates;
  }
  const rates = await activeProvider.ratesFromKes();
  // Only cache a successful fetch; a failure should retry next call, not stick.
  if (rates) {
    cache = { fetchedAt: now, rates };
  }
  return rates;
}
