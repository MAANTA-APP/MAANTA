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
 * set is stated once. It is no longer a query filter: callers read every type
 * and this module classifies. See {@link aggregateLedgerFees}.
 */
export const FEE_LEDGER_TYPES = Object.entries(LEDGER_TYPE_CONTRACT)
  .filter(([, c]) => c.bucket === "gross")
  .map(([type]) => type) as readonly LedgerTransactionType[];

/** A genuine-tagged verified redemption, with the fee the claim recorded on it. */
export type GenuineFeeRedemption = {
  id: string;
  success_fee_charged: number | string | null;
};

/**
 * A ledger movement, as the shared reader selects it.
 *
 * `transaction_type` and `created_at` are here because classification and
 * windowing both moved into {@link aggregateLedgerFees}. A caller that omits
 * either from its select cannot silently get a smaller number: the row fails
 * its contract lookup or its window test and the figure goes unknown.
 */
export type FeeLedgerRow = {
  id?: string | null;
  reference_id: string | null;
  transaction_type: string | null;
  amount: number | string | null;
  created_at: string | null;
};

/** The columns {@link aggregateLedgerFees} needs on every ledger movement. */
export const FEE_LEDGER_SELECT =
  "id, reference_id, transaction_type, amount, created_at";

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

export type LedgerFeeInput = {
  /**
   * Genuine-tagged successes verified inside the window. Used ONLY for the
   * completeness rule below — never summed.
   */
  redemptions: readonly GenuineFeeRedemption[] | null;
  /**
   * Ledger movements for the scope, of EVERY type. Must cover both the window
   * and every row linked to `redemptions`, whenever it was posted.
   */
  ledger: readonly FeeLedgerRow[] | null;
  /**
   * Redemption ids the D188 parent join confirmed genuine-tagged. A ledger row
   * pointing anywhere else is dropped: the row itself carries nothing about its
   * merchant or deal, which is the D188 conflation in money form.
   */
  genuineReferenceIds: readonly string[] | null;
  window: FeeWindow;
  cap?: number;
};

/** Parse a stored numeric, refusing anything that is not a finite number. */
function amountOf(row: FeeLedgerRow): number | null {
  if (row.amount === null || row.amount === undefined) return null;
  const n = Number(row.amount);
  return Number.isFinite(n) ? n : null;
}

/** True when a movement's own timestamp falls inside the window. */
function inWindow(row: FeeLedgerRow, w: FeeWindow): boolean {
  if (!row.created_at) return false;
  const t = Date.parse(row.created_at);
  if (Number.isNaN(t)) return false;
  const since = Date.parse(w.since);
  if (Number.isNaN(since) || t < since) return false;
  if (!w.until) return true;
  const until = Date.parse(w.until);
  return !Number.isNaN(until) && t < until;
}

/**
 * Gross, reversals and net fees for a genuine-tagged scope over one window.
 *
 * ## What each figure counts
 *
 * - **gross** — `success_fee` + `success_fee_arrears` rows posted in the
 *   window, each read through its declared orientation so both arrive as a
 *   positive KES magnitude.
 * - **reversals** — `fee_reversal` rows posted in the window.
 * - **net** — gross minus reversals.
 *
 * ## The window follows the MOVEMENT, not the redemption
 *
 * A reversal posted today against a redemption verified six weeks ago belongs
 * to today's reversals: that is when the money moved, and a reader asking "what
 * did the last 30 days earn" is asking about money movement. Windowing
 * reversals by their redemption's date would hide every correction made to
 * older activity — precisely the corrections a fee KPI exists to surface.
 *
 * ## Why this reads the ledger and not `redemptions.success_fee_charged`
 *
 * `verify_redemption` sets `status = 'success'` **before** the fee step, and
 * runs the fee step inside `EXCEPTION WHEN OTHERS` that does not re-raise. So
 * when the fee step throws, the transaction still commits: the redemption is
 * `success`, its `success_fee_charged` keeps the value the claim wrote, and
 * **no ledger row exists at all**. Summing that column reports revenue that
 * never entered the ledger.
 *
 * ## The unknown states, and why none of them is zero
 *
 * - either read FAILED -> unknown. Never 0 (D164 / D185).
 * - either read hit the cap -> unknown, because a truncated SUM is D149.
 * - **a genuine success in the window with no linked fee row** -> gross and net
 *   unknown. That is the documented third money state: money is owed and was
 *   never recorded, so the billed total is not established. Checked against
 *   fee rows from ANY date, not just in-window ones, so a fee posted seconds
 *   after midnight does not manufacture an unknown.
 * - **a row whose amount contradicts its type's declared sign** -> that bucket
 *   unknown. Not normalised: a wrong-signed money row is a fact about the
 *   ledger, and `Math.abs` used to hide it.
 */
export function aggregateLedgerFees(input: LedgerFeeInput): LedgerFeeTotals {
  const { redemptions, ledger, genuineReferenceIds, window: w } = input;
  const cap = input.cap ?? FEE_ROW_CAP;

  if (redemptions === null || ledger === null || genuineReferenceIds === null) {
    return UNKNOWN_FEE_TOTALS;
  }
  if (
    redemptions.length >= cap ||
    ledger.length >= cap ||
    genuineReferenceIds.length >= cap
  ) {
    return UNKNOWN_FEE_TOTALS;
  }

  const genuine = new Set(genuineReferenceIds);

  let gross: number | null = 0;
  let reversals: number | null = 0;
  // Fee rows linked to a genuine redemption, of ANY date — the completeness
  // question is "did this redemption's fee ever post", not "did it post today".
  const billed = new Set<string>();

  for (const row of ledger) {
    const ref = row.reference_id;
    if (!ref || !genuine.has(ref)) continue;

    const contract =
      row.transaction_type &&
      Object.prototype.hasOwnProperty.call(
        LEDGER_TYPE_CONTRACT,
        row.transaction_type
      )
        ? LEDGER_TYPE_CONTRACT[row.transaction_type as LedgerTransactionType]
        : null;
    // An unrecognised type generates nothing here. The contract is asserted to
    // cover the CHECK constraint in test, so this branch is a database that has
    // moved ahead of the code, not a decision made silently at runtime.
    if (contract === null || contract.bucket === "excluded") continue;

    if (contract.bucket === "gross") billed.add(ref);
    if (!inWindow(row, w)) continue;

    const raw = amountOf(row);
    const oriented = raw === null ? null : raw * contract.orientation;
    // Unexpected polarity — including a zero-amount fee row, which neither RPC
    // can write. Exposed as unknown rather than absorbed.
    const bad = oriented === null || oriented <= 0;

    if (contract.bucket === "gross") {
      gross = bad || gross === null ? null : gross + oriented!;
    } else {
      reversals = bad || reversals === null ? null : reversals + oriented!;
    }
  }

  for (const r of redemptions) {
    if (!billed.has(r.id)) {
      gross = null;
      break;
    }
  }

  return {
    grossKes: gross,
    reversalsKes: reversals,
    netKes: gross === null || reversals === null ? null : gross - reversals,
  };
}

/**
 * Minimal PostgREST surface the fee reader chains onto.
 *
 * Same reason as {@link EqChain}: Supabase's builder types are deep enough that
 * threading them through four dependent reads makes tsc give up with "Type
 * instantiation is excessively deep". The casts are confined to this file.
 */
type FeeQuery = {
  eq(column: string, value: unknown): FeeQuery;
  in(column: string, values: readonly unknown[]): FeeQuery;
  gte(column: string, value: unknown): FeeQuery;
  lt(column: string, value: unknown): FeeQuery;
  not(column: string, operator: string, value: unknown): FeeQuery;
  limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

/** Just enough of the service client to issue the four reads below. */
export type FeeReadClient = {
  from(table: string): { select(columns: string): unknown };
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
 * Every caller used to build the query itself, and every caller therefore had
 * to get the same four things right: the D188 parent join, the
 * `reference_id` link, the row cap, and which transaction types count. The last
 * of those was a `.in("transaction_type", …)` repeated at three call sites — a
 * correctness rule living in the callers, where a fourth surface would have had
 * to rediscover it and a reversal would never have been noticed at all.
 *
 * Callers now pass a scope and a window. There is no type filter to forget,
 * because there is no type filter: this reads every movement and
 * {@link aggregateLedgerFees} classifies them against the ledger contract.
 *
 * ## The four reads, and why the last two exist
 *
 * 1. **Completeness set** — genuine successes verified in the window. A success
 *    with no fee row anywhere makes gross unknown.
 * 2. **Window rows** — every referenced movement posted in the window. This is
 *    the read that catches a reversal against an older redemption, which is the
 *    entire reason the window follows the movement's own timestamp.
 * 3. **Linked rows** — movements against (1)'s redemptions whatever their date,
 *    so a fee posted just outside the window still answers the completeness
 *    question instead of manufacturing an unknown at a midnight boundary.
 *    Merged with (2) and de-duplicated by row id.
 * 4. **Genuine ids** — the D188 join over the ids (2) and (3) actually
 *    reference. A ledger row carries nothing about its merchant or deal, so
 *    without this a fee against a demo-tagged deal would land in a figure whose
 *    neighbours are all genuine-tagged. That is the D188 conflation in money
 *    form, and it is why this is a join and not a column read.
 */
export async function readLedgerFeeTotals(
  service: FeeReadClient,
  scope: FeeScope,
  cap: number = FEE_ROW_CAP
): Promise<LedgerFeeTotals> {
  const { merchantIds, window: w } = scope;
  if (merchantIds !== undefined && merchantIds.length === 0) {
    return { grossKes: 0, reversalsKes: 0, netKes: 0 };
  }

  const windowed = (q: FeeQuery, column: string) => {
    const gated = q.gte(column, w.since);
    return w.until ? gated.lt(column, w.until) : gated;
  };

  const scopedRedemptions = (columns: string) => {
    let q = genuineTagged(
      service.from("redemptions").select(genuineJoinSelect(columns)) as FeeQuery
    ).eq("status", "success");
    if (merchantIds) q = q.in("merchant_id", merchantIds);
    return q;
  };

  const movements = () => {
    let q = service
      .from("merchant_transactions")
      .select(FEE_LEDGER_SELECT) as FeeQuery;
    if (merchantIds) q = q.in("merchant_id", merchantIds);
    // Not a type filter: a movement with no `reference_id` cannot be matched to
    // a genuine redemption, so it can never contribute to any of the three
    // figures. Narrowing by that keeps unrelated top-up volume from spending
    // the row cap and turning a readable figure into an unavailable one.
    return q.not("reference_id", "is", null);
  };

  const rows = <T,>(r: { data: unknown[] | null; error: unknown }): T[] | null =>
    r.error ? null : ((r.data ?? []) as T[]);

  const [redRes, windowRes] = await Promise.all([
    windowed(scopedRedemptions("id, success_fee_charged"), "redeemed_at").limit(cap),
    windowed(movements(), "created_at").limit(cap),
  ]);

  const redemptions = rows<GenuineFeeRedemption>(redRes);
  const windowRows = rows<FeeLedgerRow>(windowRes);
  if (redemptions === null || windowRows === null) return UNKNOWN_FEE_TOTALS;

  let linkedRows: FeeLedgerRow[] = [];
  if (redemptions.length > 0) {
    const linkedRes = await movements()
      .in(
        "reference_id",
        redemptions.map((r) => r.id)
      )
      .limit(cap);
    const linked = rows<FeeLedgerRow>(linkedRes);
    if (linked === null) return UNKNOWN_FEE_TOTALS;
    linkedRows = linked;
  }

  // De-duplicate by row id. A row can satisfy both reads, and counting it twice
  // would double a fee — the one arithmetic error a money KPI cannot survive.
  const byId = new Map<string, FeeLedgerRow>();
  const noId: FeeLedgerRow[] = [];
  for (const row of [...windowRows, ...linkedRows]) {
    if (row.id) byId.set(row.id, row);
    else noId.push(row);
  }
  const ledger = [...Array.from(byId.values()), ...noId];

  const referenced = Array.from(
    new Set(
      ledger
        .map((r) => r.reference_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  let genuineReferenceIds: string[] = [];
  if (referenced.length > 0) {
    const genuineRes = await scopedRedemptions("id")
      .in("id", referenced)
      .limit(cap);
    const genuineRows = rows<{ id: string }>(genuineRes);
    if (genuineRows === null) return UNKNOWN_FEE_TOTALS;
    genuineReferenceIds = genuineRows.map((r) => r.id);
  }

  return aggregateLedgerFees({
    redemptions,
    ledger,
    genuineReferenceIds,
    window: w,
    cap,
  });
}
