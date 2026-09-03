/**
 * Claim allocation — the one place that says what `deals.max_claims` means.
 *
 * ## The ruling (founder, 2026-09-03, recorded in the decisions log as D236)
 *
 * `max_claims` is **the maximum number of shopper claims that may be issued
 * for the deal**. It is not a redemption limit, not a stock count, and not an
 * inventory system. The three words every surface uses are:
 *
 *   - **Claim allocation** — `max_claims`, or "no cap" when NULL;
 *   - **Claims issued**    — `claims_count`;
 *   - **Claims remaining** — allocation minus issued, never below zero.
 *
 * ## What the code actually enforces, so the words match it
 *
 * `claim_deal` refuses a NEW claim when `max_claims IS NOT NULL AND
 * claims_count >= max_claims` (`>=`, and NULL means unlimited). Nothing else
 * reads `max_claims`: `verify_redemption` ignores it, so a claim that was
 * already issued stays redeemable however the allocation moves afterwards.
 * Lowering the allocation below the issued count therefore stops further
 * claims and touches no existing ticket — which is the behaviour the ruling
 * requires ("existing valid claims must not silently disappear"). A merchant
 * protects walk-in stock by pausing the deal or lowering its allocation; that
 * is the whole mechanism, and this module renders it rather than extending it.
 *
 * `fullyClaimed` mirrors the RPC's own predicate exactly. A fully claimed deal
 * is still discoverable (founder doctrine 2026-08-28, "discoverable is not
 * claimable"); the surfaces that advertise an available claim filter it out
 * themselves, and this module never decides visibility.
 */

export type ClaimAllocation = {
  /** `max_claims`. `null` is "no cap", not zero. */
  allocation: number | null;
  /** `claims_count` — claims issued so far. */
  issued: number;
  /** `allocation - issued`, floored at zero; `null` when there is no cap. */
  remaining: number | null;
  /** `allocation != null && issued >= allocation` — `claim_deal`'s own test. */
  fullyClaimed: boolean;
};

/** The vocabulary, written once so a label cannot drift from its number. */
export const CLAIM_ALLOCATION_LABELS = {
  allocation: "Claim allocation",
  issued: "Claims issued",
  remaining: "Claims remaining",
  uncapped: "No cap",
} as const;

export function claimAllocation(input: {
  maxClaims: number | null | undefined;
  claimsCount: number | null | undefined;
}): ClaimAllocation {
  const issued = Math.max(0, Math.floor(Number(input.claimsCount ?? 0)) || 0);
  const raw = input.maxClaims;
  const allocation =
    raw === null || raw === undefined || !Number.isFinite(Number(raw))
      ? null
      : Math.max(0, Math.floor(Number(raw)));
  if (allocation === null) {
    return { allocation: null, issued, remaining: null, fullyClaimed: false };
  }
  return {
    allocation,
    issued,
    remaining: Math.max(0, allocation - issued),
    fullyClaimed: issued >= allocation,
  };
}

/**
 * One line of copy, in the ruling's vocabulary.
 *
 *   "Claims issued 7 of 10 · 3 remaining"
 *   "Fully claimed · 10 of 10 issued"
 *   "Claims issued 7 · no cap"
 */
export function claimAllocationLine(a: ClaimAllocation): string {
  if (a.allocation === null) {
    return `${CLAIM_ALLOCATION_LABELS.issued} ${a.issued} · no cap`;
  }
  if (a.fullyClaimed) {
    return `Fully claimed · ${a.issued} of ${a.allocation} issued`;
  }
  return `${CLAIM_ALLOCATION_LABELS.issued} ${a.issued} of ${a.allocation} · ${a.remaining} remaining`;
}

/** "10" or "No cap" — the allocation on its own, for a KPI card. */
export function formatAllocation(a: ClaimAllocation): string {
  return a.allocation === null ? CLAIM_ALLOCATION_LABELS.uncapped : a.allocation.toLocaleString();
}

/** "3", or "—" when there is no cap to count down from. */
export function formatRemaining(a: ClaimAllocation): string {
  return a.remaining === null ? "—" : a.remaining.toLocaleString();
}
