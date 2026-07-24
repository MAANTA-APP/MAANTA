import type { FxProvider, KesRateMap } from "./types";

/**
 * A provider that always returns a fixed rate map. Useful for tests, for a
 * deterministic offline/self-hosted mode, or as an explicit pinned-rate
 * provider. NOTE: the *approximate* static fallback used when the live
 * provider is unreachable lives in `currency.ts` (FALLBACK_KES_RATE) and is a
 * business decision, not a provider — this class is the general building block.
 */
export class StaticFxProvider implements FxProvider {
  readonly name: string;

  constructor(
    private readonly rates: KesRateMap,
    name = "static"
  ) {
    this.name = name;
  }

  async ratesFromKes(): Promise<KesRateMap | null> {
    return this.rates;
  }
}
