/**
 * Plan deal limits — the shopper-invisible runtime rule that decides whether a
 * merchant may publish another deal.
 *
 * The AUTHORITY is the `enforce_deal_limit` trigger in
 * `supabase/migrations/20260630231915_maanta_schema_v3_baseline.sql`:
 *
 *     Standard → 1 active deal, flash deals rejected
 *     Elite    → 2 active deals
 *     count    = deals WHERE merchant_id = … AND is_active = TRUE
 *
 * This module mirrors that rule so the console can say "you're at your limit"
 * BEFORE a merchant fills in a whole wizard and uploads a cover, instead of
 * surfacing a raw Postgres exception at publish. It never replaces the trigger.
 *
 * Note the count deliberately matches the trigger's: every `is_active` deal,
 * **not** the expiry-filtered "live" list the deals page renders. An expired
 * but still-active deal occupies a slot in Postgres, so it must occupy one here
 * too — otherwise the UI would invite a publish the database then rejects.
 */

export type MerchantTier = "standard" | "elite";

/** Active-deal allowance for a tier (frozen: Standard 1, Elite 2). */
export function dealLimitForTier(tier: MerchantTier): number {
  return tier === "elite" ? 2 : 1;
}

export type DealLimitState = {
  limit: number;
  activeCount: number;
  /** True when the next publish would be rejected by `enforce_deal_limit`. */
  atLimit: boolean;
  remaining: number;
  /** Whether this tier may publish flash deals at all (Elite only). */
  canPublishFlash: boolean;
};

export function getDealLimitState(
  tier: MerchantTier,
  activeCount: number
): DealLimitState {
  const limit = dealLimitForTier(tier);
  const count = Math.max(0, activeCount);
  return {
    limit,
    activeCount: count,
    atLimit: count >= limit,
    remaining: Math.max(0, limit - count),
    canPublishFlash: tier === "elite",
  };
}

/** "Standard plan · 1 active deal at a time" — the honest plan line. */
export function dealLimitLabel(tier: MerchantTier): string {
  const limit = dealLimitForTier(tier);
  const plan = tier === "elite" ? "Elite" : "Standard";
  return `${plan} plan · ${limit} active deal${limit > 1 ? "s" : ""} at a time`;
}

/**
 * Product copy for a blocked publish. Kept here (not in the API route) so the
 * up-front UI block and the server's 409 say the same thing — the route used to
 * forward the raw trigger message ("Deal limit reached. standard plan allows 1
 * active deal(s).").
 */
export function dealLimitReachedMessage(tier: MerchantTier): string {
  const limit = dealLimitForTier(tier);
  return tier === "elite"
    ? `You already have ${limit} active deals — the Elite maximum. End or archive one to publish another.`
    : `You already have ${limit} active deal — the Standard maximum. End it, or upgrade to Elite for ${dealLimitForTier(
        "elite"
      )}.`;
}
