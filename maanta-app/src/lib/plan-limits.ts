/**
 * The per-plan ACTIVE-DEAL LIMIT, in one place — for COPY AND UI ONLY.
 *
 * ## The rule
 *
 *   Standard = maximum 1 active deal
 *   Elite    = maximum 2 active deals
 *
 * It is a locked MAANTA product invariant, not a tunable. Raising either
 * number here changes what merchants are *told*, never what they are
 * *allowed* — see the next paragraph, which is the important one.
 *
 * ## This file is NOT the authority
 *
 * `public.enforce_deal_limit()` — a BEFORE INSERT trigger on `public.deals`,
 * defined in 20260630231915_maanta_schema_v3_baseline.sql — is the single
 * enforcement point, and it holds its own copies of 1 and 2. The application
 * never pre-checks the cap: `/api/deals` and `/api/deals/repost` both attempt
 * the INSERT and translate the trigger's exception into HTTP 409/403. That is
 * deliberate and stays that way, because `authenticated` has no INSERT or
 * UPDATE grant on `deals`, so the database is the only place a limit cannot be
 * routed around.
 *
 * So: never gate a write on `activeDealLimit()`. Use it to render a number a
 * merchant reads. If this file and the trigger ever disagree, the trigger is
 * right and this file is a bug — `supabase/tests/deal_limit_cap_test.sql`
 * asserts the trigger's behaviour independently of anything here.
 *
 * ## Why it exists at all
 *
 * The numbers were previously inlined as `merchant.tier === "elite" ? 2 : 1`
 * in the merchant dashboard and the deals list, and again as bare literals in
 * the plan page, the upgrade page and the new-deal wizard's comparison table —
 * five independent copies of a locked commercial rule, none of them aware of
 * the others. A second place to state a rule is a second place for it to
 * drift. `plan-limits.test.ts` fails if a new merchant surface introduces its
 * own conditional.
 */

/** The two plans MAANTA sells. Mirrors the `merchants.tier` CHECK. */
export type MerchantTier = "standard" | "elite";

/** Active deals a plan may run at once. The DB trigger enforces the same. */
export const ACTIVE_DEAL_LIMITS: Readonly<Record<MerchantTier, number>> = {
  standard: 1,
  elite: 2,
};

/**
 * Normalise whatever the row carried into a known plan.
 * Anything unrecognised reads as Standard — the restrictive choice, so a
 * surprise value can never *display* extra capacity. (The column's CHECK makes
 * this unreachable today; the trigger raises for an unknown tier regardless.)
 */
export function normaliseTier(tier: string | null | undefined): MerchantTier {
  return tier === "elite" ? "elite" : "standard";
}

/** How many active deals this plan may run at once. */
export function activeDealLimit(tier: string | null | undefined): number {
  return ACTIVE_DEAL_LIMITS[normaliseTier(tier)];
}

/** "Standard" | "Elite" — the plan's name as merchants see it written. */
export function planLabel(tier: string | null | undefined): "Standard" | "Elite" {
  return normaliseTier(tier) === "elite" ? "Elite" : "Standard";
}

/**
 * The founder-approved sentence for a merchant who is at (or asking about)
 * their limit. Exact wording, ruled 2026-08-26:
 *
 *   Standard → "Standard includes 1 active deal."
 *   Elite    → "Elite includes up to 2 active deals."
 *
 * Deliberately carries no price and no upgrade promise: Elite has no published
 * price (founder ruling 2026-08-24) and this string renders in places that
 * must not imply one.
 */
export function activeDealLimitCopy(tier: string | null | undefined): string {
  return normaliseTier(tier) === "elite"
    ? `Elite includes up to ${ACTIVE_DEAL_LIMITS.elite} active deals.`
    : `Standard includes ${ACTIVE_DEAL_LIMITS.standard} active deal.`;
}
