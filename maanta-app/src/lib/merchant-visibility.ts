/**
 * The canonical public-merchant rule, in one place, with no I/O.
 *
 * "Can a shopper see this merchant at all?" is asked in three different shapes:
 * as filters on a joined `deals` query, as filters on a `merchants` base-table
 * query (both in `lib/data.ts`), and as a predicate over a row already in
 * memory (`/admin/pilot`). Written out three times, the third copy gets written
 * with two of the three conditions — which is exactly what happened: the pilot
 * command centre tested `status === "suspended" || !isVisible`, so a `pending`
 * or `churned` merchant, and every shadow-banned one, fell through to a supply
 * diagnosis instead of being reported as not live.
 *
 * So the conditions live here once and every form consumes them. This module
 * deliberately imports nothing: `lib/data.ts` pulls in `next/headers` and the
 * service client, and a pure rule that cannot be evaluated in a unit test
 * without booting half of Next is a rule that gets re-implemented locally.
 */

/** The rule as data — the single definition every form below is derived from. */
export const PUBLIC_MERCHANT_CONDITIONS = [
  { column: "status", value: "active" },
  { column: "is_visible", value: true },
  { column: "is_shadow_banned", value: false },
] as const;

/** The merchant fields the public rule reads. Every one is required. */
export type PublicMerchantFacts = {
  status: string;
  isVisible: boolean;
  isShadowBanned: boolean;
};

/**
 * Which condition of the public rule this merchant fails, or null if none.
 *
 * Returns the failing condition rather than a bare boolean so a surface can say
 * *why* a merchant is invisible — "status is pending", "hidden" and
 * "shadow-banned" are different operational situations with different next
 * actions, and collapsing them into "not visible" discards the only part an
 * operator can act on.
 */
export function publicMerchantBlocker(
  m: PublicMerchantFacts
): "status" | "is_visible" | "is_shadow_banned" | null {
  if (m.status !== "active") return "status";
  if (!m.isVisible) return "is_visible";
  if (m.isShadowBanned) return "is_shadow_banned";
  return null;
}

/**
 * Is this merchant one a shopper can see at all?
 *
 * The in-memory twin of `withPublicMerchantRows`. Anything this returns `false`
 * for reaches no shopper, whatever its deals look like — so a caller diagnosing
 * supply must ask this FIRST. "Zero visible deals" said of a merchant that
 * cannot be public at all is a true sentence pointing at the wrong problem.
 */
export function isPublicMerchant(m: PublicMerchantFacts): boolean {
  return publicMerchantBlocker(m) === null;
}

/**
 * Merchant statuses that block verification at the counter.
 *
 * `requireMerchant` returns 403 for these BEFORE calling `verify_redemption`,
 * so a ticket held against such a merchant cannot be redeemed through the
 * product — the RPC itself has no status check, which makes the application
 * path the real gate and the only one worth reading.
 *
 * Deliberately NOT the same set as `PUBLIC_MERCHANT_CONDITIONS`. A merchant who
 * is merely hidden (`is_visible = false`) or shadow-banned can still verify, so
 * their shoppers' tickets stay live and must keep their expiry notices; and a
 * `pending` merchant is not blocked either, so gating on `status = 'active'`
 * would over-exclude. Discovery and redeemability are different questions.
 */
export const VERIFICATION_BLOCKING_MERCHANT_STATUSES = [
  "suspended",
  "rejected",
  "churned",
] as const;
