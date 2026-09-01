-- Staff call-forward: atomic queue state + durable shopper notification.
DO $$
DECLARE
  v_shopper_auth uuid := gen_random_uuid();
  v_owner_auth uuid := gen_random_uuid();
  v_other_auth uuid := gen_random_uuid();
  v_staff_auth uuid := gen_random_uuid();
  v_blocked_staff_auth uuid := gen_random_uuid();
  v_shopper uuid;
  v_owner uuid;
  v_other uuid;
  v_staff uuid;
  v_blocked_staff uuid;
  v_merchant uuid;
  v_deal uuid;
  v_redemption uuid;
  v_presentation uuid;
  v_result record;
  v_count integer;
  v_distinct_count bigint;
  v_status text;
  v_called_at timestamptz;
  v_called_by uuid;
  v_notification_expires_at timestamptz;
  v_notification_created_at timestamptz;
  v_call_generation bigint;
  v_function_def text;
  v_verify_def text;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_shopper_auth) RETURNING id INTO v_shopper;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auth) RETURNING id INTO v_owner;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_other_auth) RETURNING id INTO v_other;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_staff', v_staff_auth) RETURNING id INTO v_staff;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_staff', v_blocked_staff_auth) RETURNING id INTO v_blocked_staff;
  INSERT INTO public.merchants (
    user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance
  ) VALUES (
    v_owner, '__test_queue_call', 'queue.call.test', '+254700000401', 'BBS Mall', 'active', true, 500
  ) RETURNING id INTO v_merchant;
  INSERT INTO public.merchant_staff (merchant_id, user_id, staff_name, phone, can_verify)
  VALUES
    (v_merchant, v_staff, 'Queue Staff', '+254700000402', true),
    (v_merchant, v_blocked_staff, 'No-call Staff', '+254700000403', false);
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

  SELECT * INTO v_result FROM public.call_shopper_forward(v_presentation, v_merchant, v_staff);
  ASSERT v_result.newly_called, 'first call must report newly_called';
  ASSERT v_result.shopper_id = v_shopper, 'function must return the queued shopper';

  SELECT status, called_at, called_by, call_generation
    INTO v_status, v_called_at, v_called_by, v_call_generation
  FROM public.merchant_presentations WHERE id = v_presentation;
  ASSERT v_status = 'called' AND v_called_at IS NOT NULL
      AND v_called_by = v_staff AND v_call_generation = 1,
    'staff call must persist called state, timestamp, and actor';

  SELECT count(*), max(expires_at), max(created_at)
    INTO v_count, v_notification_expires_at, v_notification_created_at
  FROM public.notifications
  WHERE presentation_id = v_presentation
    AND user_id = v_shopper
    AND message = 'It''s your turn — please go to the counter.';
  ASSERT v_count = 1, 'call and durable shopper notification must commit together';
  ASSERT v_notification_expires_at IS NOT NULL,
    'durable call alert must retain its queue-expiry snapshot';
  ASSERT v_notification_created_at = v_called_at,
    'durable alert time must equal the post-lock called_at clock';
  SELECT max(call_generation) INTO v_call_generation
  FROM public.notifications WHERE presentation_id = v_presentation;
  ASSERT v_call_generation = 1,
    'first call notification must carry generation one';

  SELECT * INTO v_result FROM public.call_shopper_forward(v_presentation, v_merchant, v_owner);
  ASSERT NOT v_result.newly_called, 'retry must be idempotent';
  SELECT count(*) INTO v_count FROM public.notifications WHERE presentation_id = v_presentation;
  ASSERT v_count = 1, 'retry must not duplicate the inbox row';

  -- Explicit rejoin reuses the presentation identity but preserves its call
  -- generation. The next staff call advances it and must write a new alert;
  -- an idempotent retry of either call must not suppress the other.
  UPDATE public.merchant_presentations
  SET status = 'waiting', called_at = NULL, called_by = NULL,
      expires_at = clock_timestamp() + interval '10 minutes'
  WHERE id = v_presentation;
  SELECT * INTO v_result
  FROM public.call_shopper_forward(v_presentation, v_merchant, v_owner);
  ASSERT v_result.newly_called, 'call after explicit rejoin must be a new transition';
  SELECT count(*), count(DISTINCT call_generation), max(call_generation), max(created_at)
    INTO v_count, v_distinct_count, v_call_generation, v_notification_created_at
  FROM public.notifications WHERE presentation_id = v_presentation;
  ASSERT v_count = 2 AND v_distinct_count = 2 AND v_call_generation = 2,
    'second call generation must create exactly one fresh durable alert';
  SELECT called_at INTO v_called_at
  FROM public.merchant_presentations WHERE id = v_presentation;
  ASSERT v_notification_created_at = v_called_at,
    'latest alert time must equal the latest called_at';

  SELECT status INTO v_status FROM public.redemptions WHERE id = v_redemption;
  ASSERT v_status = 'pending', 'calling forward must never verify the deal code';

  BEGIN
    PERFORM public.call_shopper_forward(v_presentation, v_merchant, v_blocked_staff);
    RAISE EXCEPTION 'staff without can_verify was allowed to call a shopper';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%queue_call_unauthorized%' THEN RAISE; END IF;
  END;

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

  ASSERT NOT has_table_privilege('authenticated', 'public.notifications', 'UPDATE'),
    'shopper must not have table-wide notification update';
  ASSERT has_column_privilege('authenticated', 'public.notifications', 'is_read', 'UPDATE'),
    'shopper must retain read-receipt updates';
  ASSERT NOT has_column_privilege('authenticated', 'public.notifications', 'presentation_id', 'UPDATE'),
    'shopper must not pre-empt a queue-call idempotency key';

  SELECT pg_get_functiondef(
    'public.call_shopper_forward(uuid,uuid,uuid)'::regprocedure
  ) INTO v_function_def;
  ASSERT strpos(v_function_def, 'FROM public.redemptions r') > 0
      AND strpos(v_function_def, 'SELECT p.* INTO v_row') > 0
      AND strpos(v_function_def, 'FROM public.redemptions r')
        < strpos(v_function_def, 'SELECT p.* INTO v_row'),
    'call path must lock redemption before presentation';
  ASSERT strpos(v_function_def, 'v_now := clock_timestamp();')
      > strpos(v_function_def, 'SELECT p.* INTO v_row'),
    'queue deadlines must use a fresh clock after both lock waits';

  SELECT pg_get_functiondef(
    'public.verify_redemption(uuid,text,text,boolean,text)'::regprocedure
  ) INTO v_verify_def;
  ASSERT strpos(
    v_verify_def,
    'IF v_redemption.expires_at < clock_timestamp() THEN'
  ) > 0, 'verification must refresh expiry after its redemption lock wait';
  ASSERT strpos(
    v_verify_def,
    'IF v_redemption.expires_at < NOW() THEN'
  ) = 0, 'transaction-stable verification expiry check must be absent';

  UPDATE public.merchant_presentations
  SET expires_at = clock_timestamp() - interval '1 second'
  WHERE id = v_presentation;

  BEGIN
    INSERT INTO public.merchant_presentations (
      merchant_id, redemption_id, shopper_id, expires_at
    ) VALUES (
      v_merchant, v_redemption, v_shopper, clock_timestamp() + interval '10 minutes'
    );
    RAISE EXCEPTION 'expired call allowed an automatic replacement insert';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  SELECT status, called_at, called_by INTO v_status, v_called_at, v_called_by
  FROM public.merchant_presentations WHERE id = v_presentation;
  ASSERT v_status = 'called' AND v_called_at IS NOT NULL AND v_called_by = v_staff,
    'legacy automatic insert must not rejoin an already-called shopper';

  DELETE FROM public.merchant_presentations WHERE id = v_presentation;
  SELECT count(*) INTO v_count
  FROM public.notifications
  WHERE user_id = v_shopper
    AND presentation_id IS NULL
    AND expires_at = v_notification_expires_at
    AND message = 'It''s your turn — please go to the counter.';
  ASSERT v_count = 2,
    'ephemeral presentation deletion must preserve durable notification evidence';

  DELETE FROM public.notifications WHERE user_id = v_shopper;
  DELETE FROM public.redemptions WHERE id = v_redemption;
  DELETE FROM public.deals WHERE id = v_deal;
  DELETE FROM public.merchant_staff WHERE merchant_id = v_merchant;
  DELETE FROM public.merchants WHERE id = v_merchant;
  DELETE FROM public.users WHERE id IN (v_shopper, v_owner, v_other, v_staff, v_blocked_staff);
  RAISE NOTICE 'queue_call_notifications passed';
END $$;
