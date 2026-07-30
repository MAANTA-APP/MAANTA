-- ============================================================
-- Test: claim_deal rejects paused deals (deal_paused).
-- Restored by 20260730170000_restore_claim_deal_pause_gate.sql after the
-- security-hardening rewrite dropped the check.
--   psql "$DATABASE_URL" -f supabase/tests/claim_deal_pause_gate_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_err TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number)
    VALUES ('__test_pause_gate', 'test.pause.gate', '+254700000411', 'BBS Mall', 'active', 100, '1st Floor', 'P-1')
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee)
    VALUES (v_mid, 'Paused deal', 'https://img/x', true, true, NOW() + INTERVAL '6 hours', 50, 0, 30)
    RETURNING id INTO v_did;

  BEGIN
    PERFORM public.claim_deal(v_uid, v_did);
    RAISE EXCEPTION 'expected deal_paused';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%deal_paused%',
      format('paused claim must raise deal_paused, got: %s', v_err);
  END;

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.redemptions WHERE deal_id = v_did
  ), 'paused deal must not create a redemption';

  RAISE NOTICE 'claim_deal_pause_gate_test: OK';
END $$;
