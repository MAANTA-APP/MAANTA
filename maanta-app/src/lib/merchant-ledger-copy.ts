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
