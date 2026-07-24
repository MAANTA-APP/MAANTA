import type { SupportedCurrency } from "@/lib/currency";

/**
 * A source of FX rates. Providers answer a single, narrow question — "how many
 * KES is one unit of this currency worth?" — because that is the only direction
 * MAANTA ever converts (foreign top-up amount → KES wallet credit). Keeping the
 * surface this small means a new provider (a paid/SLA-backed API, a cache, a
 * test stub) is trivial to add: implement `kesPerUnit`, drop it in the chain.
 */
export interface FxRateProvider {
  /** Human-readable id, used only in logs. */
  readonly name: string;
  /**
   * KES per 1 unit of `currency` (e.g. ~129 for USD, exactly 1 for KES).
   * Return `null` when this provider cannot answer — unreachable, malformed
   * response, or an unsupported pair — so the registry falls through to the
   * next provider in the chain rather than throwing.
   */
  kesPerUnit(currency: SupportedCurrency): Promise<number | null>;
}
