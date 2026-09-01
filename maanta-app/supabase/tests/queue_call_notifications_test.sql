-- Staff call-forward: atomic queue state + durable shopper notification.
DO $$
DECLARE
  v_shopper_auth uuid := gen_random_uuid();
  v_owner_auth uuid := gen_random_uuid();
  v_other_auth uuid := gen_random_uuid();
  v_shopper uuid;
  v_owner uuid;
  v_other uuid;
  v_merchant uuid;
  v_deal uuid;
  v_redemption uuid;
  v_presentation uuid;
  v_result record;
  v_count integer;
  v_status text;
  v_called_at timestamptz;
  v_called_by uuid;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_shopper_auth) RETURNING id INTO v_shopper;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auth) RETURNING id INTO v_owner;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_other_auth) RETURNING id INTO v_other;
  INSERT INTO public.merchants (
    user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance
  ) VALUES (
    v_owner, '__test_queue_call', 'queue.call.test', '+254700000401', 'BBS Mall', 'active', true, 500
  ) RETURNING id INTO v_merchant;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_merchant, '__test call deal', 'x', true, now() + interval '2 hours', 100)
    RETURNING id INTO v_deal;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at)
    VALUES (v_deal, v_merchant, v_shopper, '920001', 'pending', now() + interval '2 hours')
    RETURNING id INTO v_redemption;
  INSERT INTO public.merchant_presentations (
    merchant_id, redemption_id, shopper_id, expires_at
  ) VALUES (
    v_merchant, v_redemption, v_shopper, now() + interval '10 minutes'
  ) RETURNING id INTO v_presentation;

  SELECT * INTO v_result FROM public.call_shopper_forward(v_presentation, v_merchant, v_owner);
  ASSERT v_result.newly_called, 'first call must report newly_called';
  ASSERT v_result.shopper_id = v_shopper, 'function must return the queued shopper';

  SELECT status, called_at, called_by INTO v_status, v_called_at, v_called_by
  FROM public.merchant_presentations WHERE id = v_presentation;
  ASSERT v_status = 'called' AND v_called_at IS NOT NULL AND v_called_by = v_owner,
    'call must persist called state, timestamp, and actor';

  SELECT count(*) INTO v_count FROM public.notifications
  WHERE presentation_id = v_presentation
    AND user_id = v_shopper
    AND message = 'It''s your turn — please go to the counter.';
  ASSERT v_count = 1, 'call and durable shopper notification must commit together';

  SELECT * INTO v_result FROM public.call_shopper_forward(v_presentation, v_merchant, v_owner);
  ASSERT NOT v_result.newly_called, 'retry must be idempotent';
  SELECT count(*) INTO v_count FROM public.notifications WHERE presentation_id = v_presentation;
  ASSERT v_count = 1, 'retry must not duplicate the inbox row';

  SELECT status INTO v_status FROM public.redemptions WHERE id = v_redemption;
  ASSERT v_status = 'pending', 'calling forward must never verify the deal code';

  BEGIN
    PERFORM public.call_shopper_forward(v_presentation, v_merchant, v_other);
    RAISE EXCEPTION 'cross-merchant actor was allowed to call a shopper';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%queue_call_unauthorized%' THEN RAISE; END IF;
  END;

  ASSERT NOT has_function_privilege('anon', 'public.call_shopper_forward(uuid,uuid,uuid)', 'EXECUTE'),
    'anon must not execute call_shopper_forward';
  ASSERT NOT has_function_privilege('authenticated', 'public.call_shopper_forward(uuid,uuid,uuid)', 'EXECUTE'),
    'authenticated must not bypass the merchant route';
  ASSERT has_function_privilege('service_role', 'public.call_shopper_forward(uuid,uuid,uuid)', 'EXECUTE'),
    'service_role route needs execute';

  DELETE FROM public.notifications WHERE presentation_id = v_presentation;
  DELETE FROM public.merchant_presentations WHERE id = v_presentation;
  DELETE FROM public.redemptions WHERE id = v_redemption;
  DELETE FROM public.deals WHERE id = v_deal;
  DELETE FROM public.merchants WHERE id = v_merchant;
  DELETE FROM public.users WHERE id IN (v_shopper, v_owner, v_other);
  RAISE NOTICE 'queue_call_notifications passed';
END $$;
