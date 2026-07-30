-- ============================================================
-- Test: claim_deal rejects paused deals (deal_paused).
-- Restored by 20260730180000_restore_claim_deal_pause_gate.sql after the
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
  v_claimed BOOLEAN := false;
  v_pause_rejected BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number)
    VALUES ('__test_pause_gate', 'test.pause.gate', '+254700000411', 'BBS Mall', 'active', 100, '1st Floor', 'P-1')
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee)
    VALUES (v_mid, 'Paused deal', 'https://img/x', true, true, NOW() + INTERVAL '6 hours', 50, 0, 30)
    RETURNING id INTO v_did;

  -- Do NOT raise the "expected" sentinel inside this block. The previous version
  -- did, and the sentinel text contained "deal_paused", so the WHEN OTHERS
  -- handler caught its own sentinel and the LIKE '%deal_paused%' assertion
  -- passed. That made the test report OK even with the gate absent — verified by
  -- stripping `RAISE EXCEPTION 'deal_paused'` from claim_deal and re-running:
  -- it still printed OK. Record success/failure in a flag and assert outside.
  BEGIN
    PERFORM public.claim_deal(v_uid, v_did);
    v_claimed := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    -- Exact match, not LIKE: a substring test is what let the sentinel through.
    v_pause_rejected := v_err = 'deal_paused';
  END;

  ASSERT NOT v_claimed,
    'claim_deal accepted a claim on a paused deal — the deal_paused gate is missing';
  ASSERT v_pause_rejected,
    format('paused claim must raise deal_paused, got: %s', COALESCE(v_err, '<none>'));

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.redemptions WHERE deal_id = v_did
  ), 'paused deal must not create a redemption';

  -- Clean up: 21 of the 22 suites here delete their fixtures, and a successful
  -- DO block commits. Without this, every run leaves rows behind and the
  -- documented `psql "$DATABASE_URL"` invocation pollutes a shared database.
  DELETE FROM public.redemptions WHERE deal_id = v_did;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;

  RAISE NOTICE 'claim_deal_pause_gate_test: OK';
END $$;
