-- Correction: the prior migration used `auth.role() <> 'service_role'` to gate the
-- authorization-check block. In SQL, comparisons against NULL return NULL, and
-- plpgsql's IF treats NULL as false — so any caller whose auth.role() is NULL
-- (e.g. no JWT context at all) would silently SKIP the authorization check instead
-- of being blocked by it. That is a fail-open bug, the opposite of the intended
-- fail-closed behavior. Replaced with `IS DISTINCT FROM 'service_role'`, which is
-- NULL-safe: it is TRUE for NULL, 'authenticated', 'anon' — anything that isn't
-- exactly 'service_role' — so the check is enforced in every case except the one
-- explicitly trusted context.

CREATE OR REPLACE FUNCTION public.onboard_merchant(p_user_id uuid, p_merchant_name text, p_phone text, p_email text, p_whatsapp text, p_node text, p_w3w_address text, p_floor text, p_unit_number text, p_entrance_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_id UUID;
  v_existing_merchant UUID;
  v_current_role TEXT;
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'unauthorized: no authenticated caller identity';
    END IF;

    IF v_caller_role IS DISTINCT FROM 'admin' AND v_caller_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'unauthorized: cannot onboard a merchant for another user';
    END IF;
  END IF;

  SELECT role INTO v_current_role
    FROM public.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF v_current_role IN ('merchant_admin', 'merchant_staff') THEN
    RAISE EXCEPTION 'already_merchant';
  END IF;

  SELECT id INTO v_existing_merchant
    FROM public.merchants WHERE user_id = p_user_id LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'merchant_exists';
  END IF;

  INSERT INTO public.merchants (
    user_id, merchant_name, phone, email, whatsapp,
    node, what3words_address, floor, unit_number, entrance_notes,
    status, tier
  )
  VALUES (
    p_user_id, p_merchant_name, p_phone,
    NULLIF(p_email, ''), NULLIF(p_whatsapp, ''),
    p_node, p_w3w_address,
    NULLIF(p_floor, ''), NULLIF(p_unit_number, ''),
    NULLIF(p_entrance_notes, ''),
    'pending', 'standard'
  )
  RETURNING id INTO v_merchant_id;

  UPDATE public.users
    SET role = 'merchant_admin'
    WHERE id = p_user_id;

  RETURN v_merchant_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.activate_merchant(p_merchant_id uuid, p_admin_user_id uuid, p_grant_elite_trial boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_status TEXT;
  v_agent_id        UUID;
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'unauthorized: admin only';
    END IF;

    IF v_caller_id IS DISTINCT FROM p_admin_user_id THEN
      RAISE EXCEPTION 'unauthorized: p_admin_user_id does not match caller identity';
    END IF;
  END IF;

  SELECT status INTO v_merchant_status
    FROM public.merchants WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  IF v_merchant_status = 'active' THEN
    RAISE EXCEPTION 'already_active';
  END IF;

  SELECT id INTO v_agent_id FROM public.agents WHERE user_id = p_admin_user_id LIMIT 1;

  UPDATE public.merchants
  SET
    status       = 'active',
    onboarded_by = v_agent_id,
    onboarded_at = NOW(),
    updated_at   = NOW()
  WHERE id = p_merchant_id;

  IF p_grant_elite_trial THEN
    UPDATE public.merchants
    SET
      tier               = 'elite',
      elite_trial_active = TRUE,
      trial_ends_at      = NOW() + INTERVAL '30 days',
      updated_at         = NOW()
    WHERE id = p_merchant_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_success_fee_or_record_arrears(p_merchant_id uuid, p_amount numeric)
 RETURNS TABLE(charged boolean, new_balance numeric, new_arrears numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_charged BOOLEAN;
  v_new_balance NUMERIC;
  v_new_arrears NUMERIC;
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_owner_user_id UUID;
BEGIN
  SELECT user_id INTO v_owner_user_id FROM public.merchants WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_role IS DISTINCT FROM 'admin' AND v_caller_id IS DISTINCT FROM v_owner_user_id THEN
      RAISE EXCEPTION 'unauthorized: not merchant owner or admin';
    END IF;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.increment_deal_claims(p_deal_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new_count INTEGER;
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_owner_user_id UUID;
BEGIN
  SELECT m.user_id INTO v_owner_user_id
    FROM public.deals d
    JOIN public.merchants m ON m.id = d.merchant_id
    WHERE d.id = p_deal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal_not_found';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_role IS DISTINCT FROM 'admin' AND v_caller_id IS DISTINCT FROM v_owner_user_id THEN
      RAISE EXCEPTION 'unauthorized: not deal owner or admin';
    END IF;
  END IF;

  UPDATE public.deals
    SET claims_count = claims_count + 1, updated_at = NOW()
    WHERE id = p_deal_id
    RETURNING claims_count INTO v_new_count;
  RETURN v_new_count;
END;
$function$;
