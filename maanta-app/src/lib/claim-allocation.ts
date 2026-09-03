/**
 * Claim allocation — the one place that says what `deals.max_claims` means.
 *
 * ## The ruling (founder, 2026-09-03; register row D223, cited in code as D236)
 *
 * `max_claims` is **the maximum number of shopper claims that may be issued
 * for the deal**. It is not a redemption limit, not a stock count, and not an
 * inventory system. The three words every surface uses are:
 *
 *   - **Claim allocation** — `max_claims`, or "no cap" when NULL;
 *   - **Claims issued**    — `claims_reserved`: claims holding a slot right now;
 *   - **Claims remaining** — allocation minus issued, never below zero.
 *
 * ## Why `claims_reserved` and never `claims_count`
 *
 * `deals.claims_count` is incremented only inside `verify_redemption` — it
 * counts REDEMPTIONS. Reading it as "claims issued" was the defect D223
 * closed: a deal with every code handed out still advertised itself as
 * claimable until someone redeemed. `claims_reserved` is a PostgREST computed
 * column (`claims_reserved(deals)`, migration `20260903120000`) backed by the
 * same `claim_occupies_allocation()` the `redemptions_reserve_claim_slot`
 * trigger and `claim_deal` enforce with, so the number a surface prints and
 * the number the database refuses on cannot disagree.
 *
 * Occupancy is DERIVED (founder ruling D224): `success` and `flagged` hold a
 * slot, a `pending` claim holds one only while unexpired, `failed` never does.
 * An unused claim that expires frees its place with nothing written anywhere,
 * so "Claims remaining" can rise on its own. Lowering the allocation below
 * what is held is refused by `/api/deals/[id]` with a pointer to pause; the
 * database still refuses to over-issue at any allocation. No existing claim
 * is ever cancelled by an edit ("existing valid claims must not silently
 * disappear").
 *
 * `fullyClaimed` mirrors the RPC's own predicate exactly (`>=`, NULL means
 * unlimited). A fully claimed deal is still discoverable (founder doctrine
 * 2026-08-28, "discoverable is not claimable"); the surfaces that advertise an
 * available claim filter it out themselves, and this module never decides
 * visibility.
 */

export type ClaimAllocation = {
  /** `max_claims`. `null` is "no cap", not zero. */
  allocation: number | null;
  /** `claims_reserved` — claims holding a slot right now. */
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
  /** `deals.claims_reserved`. Never pass `claims_count` — that counts redemptions. */
  claimsReserved: number | null | undefined;
}): ClaimAllocation {
  const issued = Math.max(0, Math.floor(Number(input.claimsReserved ?? 0)) || 0);
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
