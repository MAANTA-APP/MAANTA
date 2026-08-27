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
