import type { SupportedCurrency } from "@/lib/currency";
import type { FxRateProvider } from "./types";

/**
 * KES per 1 unit of each supported currency. Deliberately approximate: this is
 * used ONLY when the live provider is unreachable. Reaching this path at all is
 * a signal that the live FX source is unhealthy — it is a graceful degrade so a
 * top-up never hard-fails, not a long-term rate source. (Values migrated
 * verbatim from the previous inline table in currency.ts.)
 */
export const FALLBACK_KES_PER_UNIT: Record<SupportedCurrency, number> = {
  KES: 1,
  USD: 129,
  EUR: 140,
  GBP: 163,
};

export const staticFallbackProvider: FxRateProvider = {
  name: "static-fallback",
  async kesPerUnit(currency) {
    const rate = FALLBACK_KES_PER_UNIT[currency];
    return typeof rate === "number" && rate > 0 ? rate : null;
  },
};
