/**
 * FX provider abstraction (tracker E9).
 *
 * MAANTA charges card top-ups in KES/USD/EUR/GBP and converts non-KES amounts
 * to KES before crediting the merchant wallet. The conversion rate comes from
 * an FX provider. This interface lets us swap the provider (keyless
 * open.er-api.com today → an SLA-backed/paid source before real non-KES
 * charges go live) without touching the money path in `currency.ts`.
 *
 * Rates are expressed as **units of the target currency per 1 KES** — i.e.
 * `rates.USD` is how many USD one KES buys — matching the open.er-api.com
 * `latest/KES` response shape, so `toKes(amount, cur) = amount / rates[cur]`.
 */
export type KesRateMap = Record<string, number>;

export interface FxProvider {
  /** Stable identifier for logs/telemetry (e.g. "open.er-api.com"). */
  readonly name: string;
  /**
   * Fetch current rates expressed as currency-per-KES. Returns `null` on any
   * failure (network, timeout, bad shape) — never throws — so a provider
   * outage degrades to the static fallback in `currency.ts` rather than
   * hard-failing a top-up.
   */
  ratesFromKes(): Promise<KesRateMap | null>;
}
