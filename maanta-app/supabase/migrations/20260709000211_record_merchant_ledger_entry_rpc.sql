-- Atomic credit-side counterpart to deduct_success_fee_or_record_arrears.
-- Used by payment webhooks (top-ups, refunds, dispute holds/releases) which
-- always run with the service-role key, so unlike the redemption RPCs this
-- one is service_role-only and performs no caller-identity fallback.
--
-- Guarantees, all inside one transaction block:
--   * provider_reference idempotency enforced IN the function via the
--     merchant_transactions_provider_reference_key unique constraint —
--     a duplicate delivery rolls back the balance update too and returns
--     applied = false (closes the read-then-insert TOCTOU race the old
--     src/lib/merchant-ledger.ts had).
--   * balance updated with a single atomic UPDATE (no read-modify-write
--     lost-update race).
--   * debits that exceed the wallet clamp the balance at zero and move the
--     shortfall to outstanding_arrears (merchants.account_balance has a
--     >= 0 CHECK), mirroring the success-fee arrears pattern.
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

  -- Sub-block so a duplicate provider_reference rolls back BOTH writes.
  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    -- Same provider_reference already recorded: duplicate webhook delivery.
    -- The balance update above is rolled back with this block.
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
