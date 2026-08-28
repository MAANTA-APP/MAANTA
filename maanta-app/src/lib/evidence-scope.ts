/**
 * D188 — the one place that decides what "genuine-tagged" means in SQL.
 *
 * ## The defect this encodes against
 *
 * `claim_deal` never sets `redemptions.is_demo`, so every claim made through
 * the product takes the column default and is tagged `is_demo = false` —
 * **including a claim against a synthetic merchant**. Demo tagging on
 * redemptions comes only from the seed scripts. Measured on production
 * 2026-08-26: of 6 non-demo redemptions, 1 had a non-demo merchant and 5 were
 * claims against demo merchants. The long-cited "5 real redemptions" were 1
 * internal success plus 4 demo-merchant claims.
 *
 * So `redemptions.is_demo` is **not a discriminator** and must never be used
 * alone. Genuine-tagged requires the parent join: the redemption, its merchant
 * and its deal are all non-demo.
 *
 * ## Why it is a helper and not a copied predicate
 *
 * The three `.eq()` calls were inlined at three separate call sites in
 * `/admin`. PR 5 needs the same rule at roughly a dozen more. A second place
 * to enforce a rule is a second place to drift, and this particular rule is
 * one where drift silently inflates field evidence — the exact failure D188
 * exists to prevent. `evidence-scope.test.ts` bans a hand-rolled fourth copy.
 *
 * ## What this is NOT
 *
 * Genuine-tagged is a property of the **data**, not a judgement about whether
 * something is real market evidence. An internal E2E shop satisfies every
 * condition here. Separating internal from external field validation is the
 * cohort manifest's job (`lib/pilot-cohort.ts`), and the two must be reported
 * as different numbers.
 */

/**
 * The select string that brings both parents into the query.
 *
 * `!inner` matters: without it PostgREST emits a LEFT join and the parent
 * filters stop excluding anything, which fails open — the precise mistake this
 * module exists to prevent. `node` rides along on `merchants` so a node-scoped
 * caller can filter on the same join instead of adding a second one.
 */
export function genuineJoinSelect(
  columns = "id",
  merchantExtras: readonly string[] = []
): string {
  const merchant = ["is_demo", "node", ...merchantExtras].join(",");
  return `${columns}, merchants!inner(${merchant}), deals!inner(is_demo)`;
}

/** The common case: a head/count query that needs no columns of its own. */
export const GENUINE_JOIN_SELECT = genuineJoinSelect();

/**
 * Minimal shape of the PostgREST filter builder this helper chains onto.
 *
 * Deliberately NOT a self-referential generic (`<T extends Eq<T>>`): Supabase's
 * builder types are deep enough that constraining a generic by its own return
 * type makes tsc give up with "Type instantiation is excessively deep". So the
 * public signature passes the caller's type straight through and the chaining
 * happens behind one contained cast. The cast is safe because every PostgREST
 * filter builder returns itself from `.eq()` — that is the whole idiom — and it
 * is confined to this file rather than repeated at a dozen call sites.
 */
type EqChain = { eq(column: string, value: unknown): EqChain };

/**
 * Apply the D188 three-way non-demo predicate to a redemptions query.
 *
 * Use with {@link GENUINE_JOIN_SELECT}; the parent filters need those joins to
 * exist. Chainable, so node scoping and time windows compose after it.
 */
export function genuineTagged<T>(query: T): T {
  return (query as EqChain)
    .eq("is_demo", false)
    .eq("merchants.is_demo", false)
    .eq("deals.is_demo", false) as T;
}

/**
 * Scope a query that already carries {@link GENUINE_JOIN_SELECT} to one node.
 *
 * Only `merchants` and `deals` carry a `node` column, so redemptions reach a
 * node through their merchant — the same rule `/admin` follows.
 */
export function atMerchantNode<T>(query: T, node: string): T {
  return (query as EqChain).eq("merchants.node", node) as T;
}

/**
 * Bound on rows pulled in one fee read.
 *
 * PostgREST caps rows, and a SUM over a silently truncated page is the D149
 * failure in its worst form — a money figure that is low, plausible, and wrong.
 * Both fee surfaces read at most this many rows and report the sum UNAVAILABLE
 * if they hit the cap, rather than returning the partial total.
 */
export const FEE_ROW_CAP = 500;

/**
 * The ledger entry types that represent a billed success fee.
 *
 * BOTH count. `deduct_success_fee_or_record_arrears` debits the wallet and
 * writes `success_fee` when the balance covers it, and writes
 * `success_fee_arrears` when it does not — the frozen rule is that the fee is
 * charged OR recorded as arrears, and arrears are owed money, not absent money.
 * Counting only `success_fee` would under-report exactly the merchants who ran
 * out of balance, which is the population the pilot is watching most closely.
 */
export const FEE_LEDGER_TYPES = ["success_fee", "success_fee_arrears"] as const;

/** A genuine-tagged verified redemption, with the fee the claim recorded on it. */
export type GenuineFeeRedemption = {
  id: string;
  success_fee_charged: number | string | null;
};

/** A ledger entry linked back to the redemption that caused it. */
export type FeeLedgerRow = {
  reference_id: string | null;
  amount: number | string | null;
};

/**
 * Total fees ACTUALLY BILLED for a set of genuine-tagged verified redemptions.
 *
 * ## Why this reads the ledger and not `redemptions.success_fee_charged`
 *
 * `verify_redemption` sets `status = 'success'` **before** the fee step, and
 * runs the fee step inside `EXCEPTION WHEN OTHERS` that does not re-raise. So
 * when the fee step throws, the transaction still commits: the redemption is
 * `success`, its `success_fee_charged` keeps the value the claim wrote, and
 * **no ledger row exists at all**. That is the documented third money state —
 * the RPC's own agent task says "Success fee KES 30 was neither charged nor
 * recorded as arrears".
 *
 * Summing `success_fee_charged` therefore reports revenue that never entered
 * the ledger. On a page whose purpose is to say what the pilot has actually
 * earned, that is the worst possible direction to be wrong in.
 *
 * ## The three outcomes, and why two of them are null
 *
 * - either read FAILED -> `null`. Never 0 (D164 / D185).
 * - either read hit the cap -> `null`, because a truncated SUM is D149.
 * - **a genuine success with no linked ledger entry** -> `null`. This is the
 *   `unknown` state above: money is owed and was never recorded, so the true
 *   billed total is not established. Returning the ledger sum alone would be a
 *   quietly low number presented as fact; returning `success_fee_charged`
 *   would be revenue that does not exist. Unknown is the honest answer, and it
 *   is the same answer this codebase gives every other unreadable figure.
 * - otherwise -> the sum of the linked ledger amounts, read as stored.
 *
 * `Math.abs` because a charge is written negative (a wallet debit) and arrears
 * positive; both are the same KES 30 of billed fee.
 */
export function sumLedgerSuccessFees(
  redemptions: readonly GenuineFeeRedemption[] | null,
  ledger: readonly FeeLedgerRow[] | null,
  cap: number = FEE_ROW_CAP
): number | null {
  if (redemptions === null || ledger === null) return null;
  if (redemptions.length >= cap || ledger.length >= cap) return null;

  const linked = new Set(
    ledger.map((r) => r.reference_id).filter((id): id is string => Boolean(id))
  );
  // Every genuine success must have produced a ledger entry. One that did not
  // is a fee in the `unknown` state, and it makes the TOTAL unknown — not
  // smaller.
  for (const r of redemptions) {
    if (!linked.has(r.id)) return null;
  }

  return ledger.reduce((sum, r) => sum + Math.abs(Number(r.amount ?? 0)), 0);
}
