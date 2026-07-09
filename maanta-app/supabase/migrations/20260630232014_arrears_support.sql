-- Add outstanding_arrears column to merchants
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS outstanding_arrears NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (outstanding_arrears >= 0);

-- Expand merchant_transactions.transaction_type to include success_fee_arrears
DO $$
DECLARE v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'merchant_transactions'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%transaction_type%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.merchant_transactions DROP CONSTRAINT %I', v_constraint_name);
  END IF;
  ALTER TABLE public.merchant_transactions
    ADD CONSTRAINT merchant_transactions_transaction_type_check
    CHECK (transaction_type IN ('topup','success_fee','success_fee_arrears','boost_fee','subscription','refund'));
END $$;

-- Atomic deduct-or-arrears RPC
CREATE OR REPLACE FUNCTION public.deduct_success_fee_or_record_arrears(
  p_merchant_id UUID, p_amount NUMERIC
)
RETURNS TABLE (charged BOOLEAN, new_balance NUMERIC, new_arrears NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_charged BOOLEAN; v_new_balance NUMERIC; v_new_arrears NUMERIC;
BEGIN
  UPDATE public.merchants
    SET account_balance = account_balance - p_amount, updated_at = NOW()
    WHERE id = p_merchant_id AND account_balance >= p_amount
    RETURNING account_balance, outstanding_arrears INTO v_new_balance, v_new_arrears;
  IF FOUND THEN
    v_charged := TRUE;
    INSERT INTO public.merchant_transactions (merchant_id, amount, transaction_type, payment_provider, description)
    VALUES (p_merchant_id, -p_amount, 'success_fee', 'manual', 'Success fee deducted on verified redemption');
    RETURN QUERY SELECT v_charged, v_new_balance, v_new_arrears;
    RETURN;
  END IF;
  UPDATE public.merchants
    SET outstanding_arrears = outstanding_arrears + p_amount, updated_at = NOW()
    WHERE id = p_merchant_id
    RETURNING account_balance, outstanding_arrears INTO v_new_balance, v_new_arrears;
  v_charged := FALSE;
  INSERT INTO public.merchant_transactions (merchant_id, amount, transaction_type, payment_provider, description)
  VALUES (p_merchant_id, p_amount, 'success_fee_arrears', 'manual', 'Success fee recorded as arrears — insufficient wallet balance');
  RETURN QUERY SELECT v_charged, v_new_balance, v_new_arrears;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deduct_success_fee_or_record_arrears(UUID, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.deduct_success_fee_or_record_arrears(UUID, NUMERIC) TO authenticated;
