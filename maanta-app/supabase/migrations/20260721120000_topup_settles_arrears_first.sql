-- ============================================================================
-- Top-ups settle arrears FIRST, then credit the remainder to the balance.
--
-- Frozen rule (ENGINEERING_NOTES §3; boards M6 arrears / M7 top-up):
--   "On confirm: settle arrears FIRST, credit remainder. Never pre-credit."
--   M6 arrears state: "settles automatically from your next top-up."
--
-- The previous record_merchant_ledger_entry credited the full top-up straight
-- to account_balance and never touched outstanding_arrears, so a merchant who
-- owed arrears and topped up kept BOTH the full balance and the full arrears —
-- the opposite of the frozen behaviour. This migration fixes the money path.
--
-- Model (keeps the ledger reconciling in both directions):
--   * The top-up row still records the FULL amount received (+p_amount) so the
--     wallet shows the real M-PESA/card figure.
--   * When arrears exist, a second row transaction_type = 'arrears_settlement'
--     for -settled records the payoff. It reduces BOTH the balance-affecting
--     ledger sum and the arrears ledger sum by `settled`, so:
--        account_balance     = Σ amount over balance-affecting types
--        outstanding_arrears = Σ amount over ('success_fee_arrears',
--                                             'arrears_settlement')
--   * The top-up row is inserted FIRST, under the caller's provider_reference,
--     so a duplicate webhook delivery still trips the provider_reference unique
--     constraint and rolls the whole block back (idempotent, never pre-credit).
--
-- Only the 'topup' credit path changes. Debits/refunds keep the prior
-- clamp-at-zero-then-arrears behaviour, byte-for-byte.
-- ============================================================================

-- 1) Allow the new ledger type.
ALTER TABLE public.merchant_transactions
  DROP CONSTRAINT merchant_transactions_transaction_type_check;
ALTER TABLE public.merchant_transactions
  ADD CONSTRAINT merchant_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'topup','success_fee','success_fee_arrears','boost_fee',
    'subscription','refund','dispute','arrears_settlement'
  ]));

-- 2) Settle-first record_merchant_ledger_entry. Signature unchanged, so this is
--    a CREATE OR REPLACE and existing grants carry over (re-asserted below).
CREATE OR REPLACE FUNCTION public.record_merchant_ledger_entry(
  p_merchant_id        uuid,
  p_amount             numeric,   -- signed KES: positive credits, negative debits
  p_transaction_type   text,
  p_payment_provider   text,
  p_provider_reference text,
  p_description        text,
  p_currency           text DEFAULT 'KES',
  p_charged_amount     numeric DEFAULT NULL
)
RETURNS TABLE(applied boolean, new_balance numeric, new_arrears numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new_balance NUMERIC;
  v_new_arrears NUMERIC;
  v_settled     NUMERIC;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized: service_role only';
  END IF;

  IF p_merchant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_merchant: p_merchant_id is required';
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'invalid_amount: p_amount must be a non-zero signed amount';
  END IF;

  -- Sub-block so a duplicate provider_reference rolls back EVERY write.
  BEGIN
    IF p_transaction_type = 'topup' AND p_amount > 0 THEN
      -- Settle arrears first: as much of the top-up as there is arrears to
      -- clear goes to arrears; only the remainder credits the balance.
      SELECT LEAST(outstanding_arrears, p_amount)
        INTO v_settled
        FROM public.merchants
        WHERE id = p_merchant_id
        FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'merchant_not_found';
      END IF;

      UPDATE public.merchants
        SET outstanding_arrears = outstanding_arrears - v_settled,
            account_balance     = account_balance + (p_amount - v_settled),
            updated_at          = NOW()
        WHERE id = p_merchant_id
        RETURNING account_balance, outstanding_arrears
          INTO v_new_balance, v_new_arrears;

      -- Full top-up amount, under the caller's provider_reference (idempotency
      -- anchor). Inserted before the settlement row so a duplicate delivery
      -- trips the unique constraint and rolls back the balance/arrears update.
      INSERT INTO public.merchant_transactions (
        merchant_id, amount, transaction_type, payment_provider,
        provider_reference, description, currency, charged_amount
      )
      VALUES (
        p_merchant_id, p_amount, p_transaction_type, p_payment_provider,
        p_provider_reference, p_description,
        COALESCE(p_currency, 'KES'), p_charged_amount
      );

      IF v_settled > 0 THEN
        -- provider_reference left NULL: the top-up row above is the idempotency
        -- anchor, so the settlement row needs no unique key of its own (and a
        -- duplicate delivery never reaches this insert).
        INSERT INTO public.merchant_transactions (
          merchant_id, amount, transaction_type, payment_provider,
          provider_reference, description, currency
        )
        VALUES (
          p_merchant_id, -v_settled, 'arrears_settlement', p_payment_provider,
          NULL,
          format('Arrears settled first from top-up (KES %s)', v_settled),
          COALESCE(p_currency, 'KES')
        );
      END IF;
    ELSE
      -- Unchanged generic path: debits clamp the balance at zero and move the
      -- shortfall to arrears, mirroring the success-fee arrears pattern.
      UPDATE public.merchants
        SET account_balance     = GREATEST(account_balance + p_amount, 0),
            outstanding_arrears = outstanding_arrears
                                  + GREATEST(-(account_balance + p_amount), 0),
            updated_at          = NOW()
        WHERE id = p_merchant_id
        RETURNING account_balance, outstanding_arrears
          INTO v_new_balance, v_new_arrears;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'merchant_not_found';
      END IF;

      INSERT INTO public.merchant_transactions (
        merchant_id, amount, transaction_type, payment_provider,
        provider_reference, description, currency, charged_amount
      )
      VALUES (
        p_merchant_id, p_amount, p_transaction_type, p_payment_provider,
        p_provider_reference, p_description,
        COALESCE(p_currency, 'KES'), p_charged_amount
      );
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- Same provider_reference already recorded: duplicate webhook delivery.
    -- Every write in this block is rolled back.
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, NULL::NUMERIC;
    RETURN;
  END;

  RETURN QUERY SELECT TRUE, v_new_balance, v_new_arrears;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_merchant_ledger_entry(uuid, numeric, text, text, text, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_merchant_ledger_entry(uuid, numeric, text, text, text, text, text, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.record_merchant_ledger_entry(uuid, numeric, text, text, text, text, text, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_merchant_ledger_entry(uuid, numeric, text, text, text, text, text, numeric) TO service_role;
