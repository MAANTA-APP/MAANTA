/**
 * Merchant-voice copy for wallet ledger rows (drift D104).
 *
 * The write side chooses `description` for whoever is expected to read the
 * table, and for the Node 0 opening credit that reader was an operator: the
 * grant inside `activate_merchant` writes
 *
 *   'Node 0 launch opening credit · node0_opening_credit'
 *
 * where the trailing token is the `app_config` key that controls the promo
 * (`maanta-app/supabase/migrations/20260807160000_reland_node_scoped_opening_credit_cap.sql`).
 * The wallet printed the stored description verbatim, so that key rendered on a
 * merchant money surface — a merchant met a grant they had been promised on the
 * marketing site as an unexplained top-up tagged with an internal identifier.
 *
 * Same shape as D80 (ops vocabulary reaching a merchant surface) and the same
 * resolution: a formatter split, where the read side owns merchant vocabulary
 * instead of trusting the stored string.
 *
 * Two deliberate choices, because both are the kind of thing a later change
 * would otherwise undo:
 *
 *  - **The stored description is left alone.** Correcting the literal in a new
 *    migration would fix nothing that already exists: every credit granted so
 *    far carries the operator string, and rows are never rewritten. Matching on
 *    `provider_reference` fixes the rows already in the ledger and every future
 *    one, with no migration to apply.
 *  - **Detection keys on the machine reference, not the copy.** The grant writes
 *    `node0_opening_credit:<merchant id>` as `provider_reference`, and that same
 *    prefix is what the per-node cap counts, so it cannot drift from the promo
 *    without the cap drifting too.
 */

/** Prefix the opening-credit grant writes to `provider_reference`. */
export const OPENING_CREDIT_REFERENCE_PREFIX = "node0_opening_credit:";

/**
 * The `app_config` key that must never reach a merchant. Named here so the
 * fail-safe below and the guard test both check the same token.
 */
export const OPENING_CREDIT_CONFIG_KEY = "node0_opening_credit";

export const OPENING_CREDIT_LABEL = "Opening credit";

export const OPENING_CREDIT_DESCRIPTION =
  "Added by Maanta when your shop was activated. It spends on success fees like a top-up, and is not refundable.";

/**
 * Merchant-voice fallbacks for every `transaction_type` the ledger can write —
 * the full union in `merchant-ledger.ts`, not the subset each screen happened to
 * list. The two wallet screens previously kept their own partial maps, so a
 * `success_fee_arrears` row rendered its raw enum string on the detail screen
 * and a `dispute` row rendered one on both.
 */
export const LEDGER_TYPE_LABELS: Record<string, string> = {
  topup: "Top-up",
  success_fee: "Success fee",
  success_fee_arrears: "Success fee (arrears)",
  boost_fee: "Boost",
  subscription: "Elite subscription",
  refund: "Refund",
  dispute: "Funds held for dispute",
  arrears_settlement: "Arrears settled from top-up",
};

export type LedgerRowCopy = {
  transaction_type: string;
  description: string | null;
  /**
   * Optional so a caller that does not select the column still type-checks —
   * but a caller that omits it loses opening-credit detection on rows whose
   * description was somehow cleared, which is why the guard test asserts both
   * wallet queries select it.
   */
  provider_reference?: string | null;
};

/**
 * True for the Node 0 opening credit. The description check is a fail-safe for a
 * row written without a reference: the operator string carries the same config
 * key, and that key is precisely the thing that must not render.
 */
export function isOpeningCredit(row: LedgerRowCopy): boolean {
  if ((row.provider_reference ?? "").startsWith(OPENING_CREDIT_REFERENCE_PREFIX)) return true;
  return (row.description ?? "").includes(OPENING_CREDIT_CONFIG_KEY);
}

/** Ledger row title: promotional copy first, then the stored description, then the type. */
export function formatMerchantLedgerLabel(row: LedgerRowCopy): string {
  if (isOpeningCredit(row)) return OPENING_CREDIT_LABEL;
  if (row.description) return row.description;
  return formatMerchantLedgerType(row.transaction_type);
}

/** Type line on the transaction detail screen. */
export function formatMerchantLedgerType(transactionType: string): string {
  return LEDGER_TYPE_LABELS[transactionType] ?? transactionType;
}

/**
 * The detail screen's Description row. Returns null when there is nothing worth
 * a row — the label already said it.
 */
export function formatMerchantLedgerDescription(row: LedgerRowCopy): string | null {
  if (isOpeningCredit(row)) return OPENING_CREDIT_DESCRIPTION;
  return row.description;
}

/**
 * How many verified redemptions an opening credit covers (drift D105).
 *
 * Design Brief v1.4 §9 specifies the copy as "your first 10 verified redemptions
 * covered", and 10 is KES 300 over the KES 30 success fee — a derived number
 * written down as a literal. Both inputs live in `app_config`
 * (`node0_opening_credit_kes`, `success_fee_kes`), so the literal would be a
 * hardcoded fee under a different name, and would go quietly wrong the day either
 * value moves. Founder ruled 2026-08-15 to derive it.
 *
 * Floors, because a partly-covered redemption is not covered. Returns 0 when the
 * fee is missing or zero rather than dividing by it.
 */
export function openingCreditRedemptionsCovered(
  creditAmount: number,
  successFee: number
): number {
  if (!(creditAmount > 0) || !(successFee > 0)) return 0;
  return Math.floor(creditAmount / successFee);
}

/**
 * The new-merchant opening-credit wallet state.
 *
 * The sentence is the brief's, kept clause for clause, with its three numerals
 * derived instead of typed. Returns null when there is nothing honest to say —
 * no credit, or a fee that would make the count meaningless — because a state
 * that cannot state a true number should not render at all.
 *
 * `formatMoney` is injected so this module stays free of UI imports and the
 * caller keeps one money formatter.
 */
export function formatOpeningCreditNotice(
  creditAmount: number,
  successFee: number,
  formatMoney: (amount: number) => string
): string | null {
  const covered = openingCreditRedemptionsCovered(creditAmount, successFee);
  if (covered < 1) return null;
  const redemptions = covered === 1 ? "redemption" : "redemptions";
  return (
    `${formatMoney(creditAmount)} starting credit — your first ${covered} verified ` +
    `${redemptions} covered; thereafter a transparent ${formatMoney(successFee)} success fee.`
  );
}

/**
 * True while the opening credit is still unspent: the grant is in the ledger and
 * no success fee has been charged against it yet.
 *
 * The brief scopes the state to a *new merchant*, and the sentence it specifies
 * makes a claim about "your first N redemptions" that stops being true the moment
 * one is charged. Tying the state to an unspent credit keeps the claim honest
 * without inventing a second, unruled sentence for the partly-spent case.
 *
 * **Founder ruling, 2026-08-16 (decisions log):** this predicate is the rule, not
 * a placeholder. There is deliberately no partly-spent state — a merchant who has
 * redeemed once sees the ordinary wallet, and the credit remains visible as its
 * ledger row. Widening this to keep the notice past the first success fee would
 * make the product assert something untrue, so it needs a new ruling and new copy
 * from the brief rather than a change here.
 */
export function hasUnspentOpeningCredit<T extends LedgerRowCopy>(rows: T[]): boolean {
  if (!rows.some(isOpeningCredit)) return false;
  return !rows.some(
    (r) =>
      r.transaction_type === "success_fee" || r.transaction_type === "success_fee_arrears"
  );
}

/** The granted amount from the merchant's own credit row, or null if there is none. */
export function openingCreditAmount<T extends LedgerRowCopy & { amount: number | string }>(
  rows: T[]
): number | null {
  const row = rows.find(isOpeningCredit);
  if (!row) return null;
  // The row is what this merchant was actually granted. Reading the current
  // app_config value instead would misstate an older merchant's credit the day
  // the promo amount changes.
  const amount = typeof row.amount === "string" ? parseFloat(row.amount) : row.amount;
  return Number.isFinite(amount) ? amount : null;
}

/**
 * Whether `provider_reference` is a reference the merchant can use.
 *
 * For a card or M-Pesa top-up it is the provider's own reference and belongs on
 * screen. For the opening credit it is an internal key joined to the merchant's
 * id — there is no external payment behind a manual grant, so showing it offers
 * a merchant nothing and leaks the promo key. The transaction id remains the
 * reference for support, on the ledger row and in the detail URL.
 */
export function showsProviderReference(row: LedgerRowCopy): boolean {
  return !isOpeningCredit(row);
}
