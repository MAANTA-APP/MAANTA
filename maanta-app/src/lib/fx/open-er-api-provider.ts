import type { FxProvider, KesRateMap } from "./types";

/**
 * Keyless, no-signup FX provider (open.er-api.com, backed by
 * exchangerate-api.com's free tier). This is the launch default. Before going
 * live with real non-KES charges, swap it for a paid/SLA-backed provider via
 * `configureFxProvider()` and disclose the rate source + any margin in
 * legal/refund-and-wallet-policy.md. See docs/skills/fx-provider.md.
 */
const DEFAULT_URL = "https://open.er-api.com/v6/latest/KES";
const DEFAULT_TIMEOUT_MS = 5000;

export class OpenErApiProvider implements FxProvider {
  readonly name = "open.er-api.com";

  constructor(
    private readonly url: string = DEFAULT_URL,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  async ratesFromKes(): Promise<KesRateMap | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, { signal: controller.signal });
      if (!res.ok) throw new Error(`FX provider returned ${res.status}`);
      const body = await res.json();
      const rates = body?.rates;
      // Sanity-check the shape: a real KES-base response always carries a
      // numeric USD rate. Anything else is treated as a failure.
      if (!rates || typeof rates.USD !== "number") {
        throw new Error("FX provider returned an unexpected response shape");
      }
      return rates as KesRateMap;
    } catch (err) {
      console.error("Live FX rate fetch failed, using fallback rates:", err);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
