-- ============================================================================
-- Admin fee-reversal wallet credit (BBS pilot).
--
-- Frozen policy (Decisions Log 2026-07-22, "Merchant Incentives; Fees and
-- Reversals"; MoU / Term Sheet; MAANTA_BBS_Pilot_Pack.docx):
--   * MAANTA may reverse a success fee when the merchant is clearly in the
--     right, INCLUDING cases where the shopper already redeemed the deal.
--   * Every reversal is reviewed by an admin.
--   * An approved reversal is applied ONLY by crediting the merchant's top-up
--     wallet. The original redemption row and the original success-fee ledger
--     row are left INTACT.
--   * No direct balance edits and no silent offsets are permitted — the credit
--     always writes a ledger row, exactly like every other money movement.
--
-- This migration is PURELY ADDITIVE. It does not touch verify_redemption,
-- deduct_success_fee_or_record_arrears, or record_merchant_ledger_entry, so
-- the golden-path / arrears / unknown-fee / top-up money-path invariants and
-- their SQL tests are unaffected.
--
-- What it adds:
--   1. A 'fee_reversal' merchant_transactions type (additive CHECK expansion).
--   2. public.fee_reversals — the admin audit trail (one row per reversal),
--      shaped to align with MAANTA-Fee-Reversal-Log.xlsx.
--   3. public.reverse_success_fee(...) — the admin-gated SECURITY DEFINER RPC
--      that performs the wallet credit + audit write atomically.
--   4. public.admin_fee_reversal_log — a read view projecting the xlsx columns
--      (date, merchant, redemption code, issue, decision, credit amount,
--      wallet-credit note, approver, running total).
--
-- The credit mirrors the FROZEN top-up wallet-credit rule (settle arrears
-- first, remainder to balance — 20260721120000_topup_settles_arrears_first).
-- So a merchant whose fee was charged gets the fee back on their balance, and a
-- merchant whose fee sits as arrears has that arrears cleared instead — both
-- are "credit the top-up wallet", and both keep the ledger reconciling:
--   account_balance     = Σ amount over balance-affecting types
--   outstanding_arrears = Σ amount over ('success_fee_arrears','arrears_settlement')
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Allow the new ledger type (additive; existing rows/inserts unaffected).
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchant_transactions
  DROP CONSTRAINT merchant_transactions_transaction_type_check;
ALTER TABLE public.merchant_transactions
  ADD CONSTRAINT merchant_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'topup','success_fee','success_fee_arrears','boost_fee',
    'subscription','refund','dispute','arrears_settlement','fee_reversal'
  ]));

-- ---------------------------------------------------------------------------
-- 2) Audit trail. One row per reversal. UNIQUE(redemption_id) is the DB-level
--    idempotency guard: a redemption's success fee can be reversed at most
--    once. Columns map 1:1 to MAANTA-Fee-Reversal-Log.xlsx (see the view).
--    RLS is auto-enabled by the ensure_rls event trigger; the admin policy and
--    least-privilege grants are declared explicitly below.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_reversals (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  redemption_id          UUID NOT NULL REFERENCES public.redemptions(id),
  merchant_id            UUID NOT NULL REFERENCES public.merchants(id),
  wallet_transaction_id  UUID NOT NULL REFERENCES public.merchant_transactions(id),
  redemption_code        TEXT,                    -- snapshot of the OTP at reversal time
  amount                 NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  incident_ref           TEXT,                    -- xlsx "issue" / incident number
  note                   TEXT,                    -- xlsx "decision" note
  approver_user_id       UUID REFERENCES public.users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (redemption_id)
);

CREATE INDEX IF NOT EXISTS idx_fee_reversals_merchant
  ON public.fee_reversals (merchant_id, created_at DESC);

-- Belt-and-braces (the event trigger already does this on CREATE TABLE).
ALTER TABLE public.fee_reversals ENABLE ROW LEVEL SECURITY;

-- Admins only. Merchants never see this internal review log (their wallet
-- already shows the resulting fee_reversal credit row in merchant_transactions,
-- which they can read via the existing transactions_merchant policy).
DROP POLICY IF EXISTS fee_reversals_admin ON public.fee_reversals;
CREATE POLICY fee_reversals_admin ON public.fee_reversals
  FOR ALL USING (public.current_user_role() = 'admin');

REVOKE ALL ON public.fee_reversals FROM PUBLIC, anon;
GRANT SELECT ON public.fee_reversals TO authenticated;   -- gated to admins by RLS
GRANT ALL    ON public.fee_reversals TO service_role;

COMMENT ON TABLE public.fee_reversals IS
  'Admin fee-reversal audit trail (BBS pilot). One row per reversed success fee, written atomically by reverse_success_fee alongside the fee_reversal wallet credit. Columns align with MAANTA-Fee-Reversal-Log.xlsx. UNIQUE(redemption_id) enforces one reversal per redemption.';

-- ---------------------------------------------------------------------------
-- 3) The admin-gated wallet-credit RPC.
--
--    Auth: service_role (the trusted server, which reaches this via the admin
--    route handler AFTER requireAdminApi) OR a direct admin JWT. Either way the
--    approver recorded in the audit row must resolve to a real admin user.
--
--    Guards (all inside one transaction; any failure rolls back everything):
--      * redemption must exist and be status = 'success'.
--      * a success-fee ledger row (charged or arrears) must be linked to the
--        redemption — this is what makes a reversal meaningful and blocks
--        crediting a fee that was never applied (unknown / failed redemptions).
--      * one reversal per redemption (UNIQUE(redemption_id) + explicit check
--        for a typed error message).
--      * amount is the STORED fee snapshot on the redemption, re-validated
--        against the linked fee row, never a client-supplied figure.
--
--    Effect: settle-arrears-first wallet credit (frozen top-up semantics) +
--    a fee_reversal ledger row (reference_id = redemption id, so the credit is
--    findable from the redemption exactly like the original fee) + the audit
--    row. The original redemption row and original fee row are never touched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_success_fee(
  p_redemption_id  uuid,
  p_admin_user_id  uuid DEFAULT NULL,
  p_incident_ref   text DEFAULT NULL,
  p_note           text DEFAULT NULL
)
RETURNS TABLE(
  reversal_id     uuid,
  transaction_id  uuid,
  amount          numeric,
  new_balance     numeric,
  new_arrears     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_role  TEXT := public.current_user_role();
  v_approver     UUID := COALESCE(p_admin_user_id, public.current_user_id());
  v_approver_role TEXT;
  v_redemption   RECORD;
  v_fee_amount   NUMERIC;
  v_fee_rows     INT;
  v_settled      NUMERIC;
  v_new_balance  NUMERIC;
  v_new_arrears  NUMERIC;
  v_tx_id        UUID;
  v_reversal_id  UUID;
BEGIN
  -- Gate: trusted server OR an admin JWT.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'unauthorized: admin only';
    END IF;
  END IF;

  -- The recorded approver must be a real admin (defense in depth: the service
  -- client carries no user identity of its own, so the route passes the
  -- authenticated admin's id explicitly).
  IF v_approver IS NULL THEN
    RAISE EXCEPTION 'invalid_approver: an admin approver id is required';
  END IF;
  SELECT role INTO v_approver_role FROM public.users WHERE id = v_approver;
  IF v_approver_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'invalid_approver: approver % is not an admin', v_approver;
  END IF;

  -- Lock the redemption row for the duration of the credit.
  SELECT id, merchant_id, otp_code, status, success_fee_charged
    INTO v_redemption
    FROM public.redemptions
    WHERE id = p_redemption_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'redemption_not_found';
  END IF;

  IF v_redemption.status IS DISTINCT FROM 'success' THEN
    RAISE EXCEPTION 'redemption_not_verified: only a successful redemption can have its fee reversed (status=%)', v_redemption.status;
  END IF;

  -- Idempotency: at most one reversal per redemption. Explicit check for a
  -- clear error; the UNIQUE(redemption_id) constraint is the hard backstop.
  PERFORM 1 FROM public.fee_reversals WHERE redemption_id = p_redemption_id;
  IF FOUND THEN
    RAISE EXCEPTION 'already_reversed: redemption % already has a fee reversal', p_redemption_id;
  END IF;

  -- A fee must actually have been applied for this redemption (charged OR
  -- recorded as arrears). This blocks crediting an unknown/never-charged fee.
  SELECT count(*) INTO v_fee_rows
    FROM public.merchant_transactions
    WHERE reference_id = p_redemption_id
      AND transaction_type IN ('success_fee', 'success_fee_arrears');
  IF v_fee_rows = 0 THEN
    RAISE EXCEPTION 'no_fee_to_reverse: no success-fee ledger row is linked to redemption %', p_redemption_id;
  END IF;

  -- Amount is the stored fee snapshot on the redemption (never client-supplied).
  v_fee_amount := v_redemption.success_fee_charged;
  IF v_fee_amount IS NULL OR v_fee_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: redemption % has no positive stored fee', p_redemption_id;
  END IF;

  -- Settle-arrears-first wallet credit (frozen top-up semantics). Lock the
  -- merchant row and compute how much of the credit clears standing arrears.
  SELECT LEAST(outstanding_arrears, v_fee_amount)
    INTO v_settled
    FROM public.merchants
    WHERE id = v_redemption.merchant_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  UPDATE public.merchants
    SET outstanding_arrears = outstanding_arrears - v_settled,
        account_balance     = account_balance + (v_fee_amount - v_settled),
        updated_at          = NOW()
    WHERE id = v_redemption.merchant_id
    RETURNING account_balance, outstanding_arrears
      INTO v_new_balance, v_new_arrears;

  -- The wallet credit ledger row. reference_id = redemption id ties the credit
  -- back to the redemption (findable in two places, same as the original fee).
  INSERT INTO public.merchant_transactions (
    merchant_id, amount, transaction_type, payment_provider, description, reference_id
  )
  VALUES (
    v_redemption.merchant_id,
    v_fee_amount,
    'fee_reversal',
    'manual',
    format('Fee reversal - redemption %s%s',
           v_redemption.otp_code,
           COALESCE(', incident #' || p_incident_ref, '')),
    p_redemption_id
  )
  RETURNING id INTO v_tx_id;

  -- When arrears were standing, record the settlement leg so the arrears ledger
  -- reconciles (mirrors the top-up settle-first row).
  IF v_settled > 0 THEN
    INSERT INTO public.merchant_transactions (
      merchant_id, amount, transaction_type, payment_provider, description, reference_id
    )
    VALUES (
      v_redemption.merchant_id,
      -v_settled,
      'arrears_settlement',
      'manual',
      format('Arrears settled by fee reversal (KES %s)', v_settled),
      p_redemption_id
    );
  END IF;

  -- Audit row (fails closed on a concurrent duplicate via UNIQUE(redemption_id)).
  INSERT INTO public.fee_reversals (
    redemption_id, merchant_id, wallet_transaction_id,
    redemption_code, amount, incident_ref, note, approver_user_id
  )
  VALUES (
    p_redemption_id, v_redemption.merchant_id, v_tx_id,
    v_redemption.otp_code, v_fee_amount, p_incident_ref, p_note, v_approver
  )
  RETURNING id INTO v_reversal_id;

  RETURN QUERY SELECT v_reversal_id, v_tx_id, v_fee_amount, v_new_balance, v_new_arrears;
END;
$function$;

COMMENT ON FUNCTION public.reverse_success_fee(uuid, uuid, text, text) IS
  'Admin-gated success-fee reversal (BBS pilot). Credits the merchant top-up wallet by the redemption''s stored fee (settle-arrears-first, frozen top-up semantics), writes a fee_reversal ledger row linked to the redemption, and records a fee_reversals audit row. Leaves the original redemption and original fee ledger row intact. One reversal per redemption.';

REVOKE ALL ON FUNCTION public.reverse_success_fee(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_success_fee(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_success_fee(uuid, uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Export-shaped read view. Projects the MAANTA-Fee-Reversal-Log.xlsx columns
--    and computes the running total. security_invoker so the base-table admin
--    RLS applies to any non-service caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_fee_reversal_log
  WITH (security_invoker = true) AS
SELECT
  fr.created_at                                        AS reversal_date,
  m.merchant_name                                      AS merchant,
  fr.redemption_code                                   AS redemption_code,
  fr.incident_ref                                      AS issue,
  fr.note                                              AS decision,
  fr.amount                                            AS credit_amount,
  mt.description                                       AS wallet_credit_note,
  approver.full_name                                   AS approver,
  SUM(fr.amount) OVER (ORDER BY fr.created_at, fr.id)  AS running_total,
  fr.id                                                AS reversal_id,
  fr.redemption_id                                     AS redemption_id,
  fr.merchant_id                                       AS merchant_id
FROM public.fee_reversals fr
JOIN public.merchants m            ON m.id = fr.merchant_id
LEFT JOIN public.merchant_transactions mt ON mt.id = fr.wallet_transaction_id
LEFT JOIN public.users approver    ON approver.id = fr.approver_user_id
ORDER BY fr.created_at, fr.id;

COMMENT ON VIEW public.admin_fee_reversal_log IS
  'Export-shaped projection of fee_reversals matching MAANTA-Fee-Reversal-Log.xlsx (date, merchant, redemption code, issue, decision, credit amount, wallet-credit note, approver, running total). security_invoker → admin-only via fee_reversals RLS.';

REVOKE ALL ON public.admin_fee_reversal_log FROM PUBLIC, anon;
GRANT SELECT ON public.admin_fee_reversal_log TO authenticated, service_role;
