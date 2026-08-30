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
 * The ledger's SIGNED contract, one entry per `merchant_transactions`
 * transaction type, and the only place that decides what each type means to a
 * fee figure.
 *
 * ## Why a table and not `Math.abs`
 *
 * The previous total ended `+ Math.abs(Number(r.amount ?? 0))`. `Math.abs` is
 * not arithmetic here, it is a **guess**: it says "whatever sign this row
 * carries, treat it as billed". That is exactly wrong for a reversal, whose
 * whole meaning is its direction — abs would have added a credit to the fees
 * it cancels. It also silently absorbs a row written with the wrong sign,
 * which is the one thing a money read should never do quietly.
 *
 * So each fee-bearing type declares the sign the money path actually writes,
 * verified against the live RPC bodies rather than assumed, and the reader
 * multiplies by it. A row that disagrees with its own type's contract is
 * **unexpected polarity**: it makes the figure unknown and is reported as
 * such, never normalised into a plausible number.
 *
 * ## The signs, read back from production 2026-08-29
 *
 * `pg_get_functiondef` on the live `deduct_success_fee_or_record_arrears` and
 * `reverse_success_fee`:
 *
 * | type                  | writes        | sign     |
 * |-----------------------|---------------|----------|
 * | `success_fee`         | `-p_amount`   | negative |
 * | `success_fee_arrears` | `p_amount`    | POSITIVE |
 * | `fee_reversal`        | `v_fee_amount`| positive |
 * | `arrears_settlement`  | `-v_settled`  | negative |
 *
 * The arrears row is positive because it accrues a debt rather than moving the
 * wallet: the charge leg debits `account_balance` and is written negative, the
 * arrears leg increments `outstanding_arrears` and is written positive. Both
 * are the same KES 30 of billed fee, which is why both sit in `gross` with
 * opposite orientations. **This is the point the D211 row warns about — the
 * two rows against one redemption have opposite signs — and it is why sign
 * alone can never classify a row. The type does.**
 *
 * ## Why `arrears_settlement` is excluded
 *
 * It generates no fee. It is the second leg of a top-up or a reversal, moving
 * an amount that a `success_fee_arrears` row already counted as billed, out of
 * `outstanding_arrears`. Counting it in gross would double-count the fee;
 * counting it in reversals would subtract a fee nobody reversed. It is
 * bookkeeping about money already measured, so it is measured nowhere here.
 *
 * ## Why the non-fee types are listed at all
 *
 * Callers no longer filter by type — that is the point of this table — so every
 * type in the CHECK constraint arrives here and each must have a decision
 * recorded against it. `ledger-fee-semantics.test.ts` asserts this table's keys
 * equal the constraint's list, so adding a type to the database without
 * deciding what it means to the fee KPI fails CI rather than silently
 * vanishing from a money figure.
 *
 * The excluded entries deliberately declare NO orientation. Nothing here has
 * verified which sign a `refund` or a `dispute` carries, and inventing one to
 * fill the shape would be a rule this repo did not check.
 */
export type LedgerTypeContract =
  | { bucket: "excluded" }
  | { bucket: "gross" | "reversal"; orientation: 1 | -1 };

export const LEDGER_TYPE_CONTRACT = {
  // Fee-generating: both legs of "charged OR recorded as arrears".
  success_fee: { bucket: "gross", orientation: -1 },
  success_fee_arrears: { bucket: "gross", orientation: 1 },
  // Fee-cancelling: an admin-gated wallet credit against a billed fee.
  fee_reversal: { bucket: "reversal", orientation: 1 },
  // Neither: bookkeeping, supply, or unrelated money.
  arrears_settlement: { bucket: "excluded" },
  topup: { bucket: "excluded" },
  boost_fee: { bucket: "excluded" },
  subscription: { bucket: "excluded" },
  refund: { bucket: "excluded" },
  dispute: { bucket: "excluded" },
} as const satisfies Record<string, LedgerTypeContract>;

export type LedgerTransactionType = keyof typeof LEDGER_TYPE_CONTRACT;

/**
 * The ledger entry types that represent a billed success fee.
 *
 * BOTH count. `deduct_success_fee_or_record_arrears` debits the wallet and
 * writes `success_fee` when the balance covers it, and writes
 * `success_fee_arrears` when it does not — the frozen rule is that the fee is
 * charged OR recorded as arrears, and arrears are owed money, not absent money.
 * Counting only `success_fee` would under-report exactly the merchants who ran
 * out of balance, which is the population the pilot is watching most closely.
 *
 * DERIVED from the contract above rather than declared beside it, so the billed
 * set is stated once. The SQL contract performs the arithmetic; this table
 * remains the TypeScript-side documentation and D218 drift guard.
 */
export const FEE_LEDGER_TYPES = Object.entries(LEDGER_TYPE_CONTRACT)
  .filter(([, c]) => c.bucket === "gross")
  .map(([type]) => type) as readonly LedgerTransactionType[];

/**
 * The three figures, reported separately and never collapsed into one.
 *
 * Separate because a single "Success fees" number cannot say whether a reversal
 * happened, and a reader takes it as revenue either way (D211). Gross keeps the
 * audit trail — what the money path actually billed — reversals name what was
 * given back, and net is the one a reader should act on.
 *
 * Each is independently nullable. A polarity violation on a reversal row makes
 * reversals and net unknown while gross stays established, and blanking a
 * figure that IS known would be its own small lie.
 */
export type LedgerFeeTotals = {
  /** Fees the money path billed: charged plus recorded as arrears. */
  grossKes: number | null;
  /** Fees given back by an admin-gated reversal. */
  reversalsKes: number | null;
  /** `gross - reversals`, or null if either side is unknown. */
  netKes: number | null;
};

/** Every figure unavailable — a failed read, never a zero (D164 / D185). */
export const UNKNOWN_FEE_TOTALS: LedgerFeeTotals = {
  grossKes: null,
  reversalsKes: null,
  netKes: null,
};

/** The half-open window a fee figure covers, on the LEDGER's own clock. */
export type FeeWindow = { since: string; until?: string | null };

/** Just enough of the service client to call the structured fee RPCs. */
export type FeeReadClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

/** What a fee figure is being asked about. */
export type FeeScope = {
  /**
   * Restrict to these merchants. `undefined` means every merchant; an EMPTY
   * array means nothing is in scope, which is a true zero rather than a read
   * failure — the caller established there is nobody to ask about.
   */
  merchantIds?: readonly string[];
  window: FeeWindow;
};

/**
 * Read gross, reversals and net fees for a scope — the ONLY fee read.
 *
 * ## Why the read moved here from the pages
 *
 * Every caller used to build some or all of this query itself. That left D188
 * parent validity, reference chains, completeness, scope and transaction-type
 * meaning split across TypeScript call sites under PostgREST row caps.
 *
 * Callers now pass a scope and a window. The application does not rebuild the
 * relational rules: it calls the explicit SQL wrapper and validates only the
 * all-or-nothing transport shape.
 *
 * ## Why there are two wrappers
 *
 * `merchantIds === undefined` is the only global state. Every present array,
 * including `[]`, calls the scoped wrapper, so an empty node cannot become a
 * forgotten nullable argument and expose marketplace-wide money.
 */
export async function readLedgerFeeTotals(
  service: unknown,
  scope: FeeScope
): Promise<LedgerFeeTotals> {
  const { merchantIds, window: w } = scope;
  const client = service as FeeReadClient;
  const call = merchantIds === undefined
    ? client.rpc("admin_fee_totals_global", {
        p_since: w.since,
        p_until: w.until ?? null,
      })
    : client.rpc("admin_fee_totals_for_merchants", {
        p_since: w.since,
        p_until: w.until ?? null,
        p_merchant_ids: merchantIds,
      });

  const { data, error } = await call;
  if (error) return UNKNOWN_FEE_TOTALS;

  type RpcFeeTotals = {
    gross_kes?: unknown;
    reversals_kes?: unknown;
    net_kes?: unknown;
    available?: unknown;
  };
  const row = (Array.isArray(data) ? data[0] : data) as RpcFeeTotals | null;
  if (!row || row.available !== true) return UNKNOWN_FEE_TOTALS;

  const finite = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const grossKes = finite(row.gross_kes);
  const reversalsKes = finite(row.reversals_kes);
  const netKes = finite(row.net_kes);

  // The database contract is all-or-nothing. A malformed transport shape must
  // preserve that property instead of manufacturing a partial executive card.
  if (grossKes === null || reversalsKes === null || netKes === null) {
    return UNKNOWN_FEE_TOTALS;
  }
  return { grossKes, reversalsKes, netKes };
}
