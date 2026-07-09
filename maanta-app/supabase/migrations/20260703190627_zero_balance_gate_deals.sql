-- Zero-balance gate on new deal creation (DECISIONS_LOG.md, 2026-07-03, Zero-balance behavior)
-- Blocks new deal INSERTs when the merchant's account_balance is zero or negative.
-- Does NOT touch redemptions, arrears, or the three-state feeChargeStatus model.

CREATE OR REPLACE FUNCTION public.enforce_zero_balance_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT account_balance INTO v_balance
  FROM public.merchants
  WHERE id = NEW.merchant_id;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'MERCHANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_balance <= 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE_FOR_NEW_DEAL'
      USING ERRCODE = 'P0001',
            DETAIL = 'account_balance is zero or negative — top up before creating a new deal',
            HINT = 'top_up_required';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_zero_balance_gate
  BEFORE INSERT ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_zero_balance_gate();
