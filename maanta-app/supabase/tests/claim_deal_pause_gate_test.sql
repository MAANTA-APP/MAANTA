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
  v_claimed BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number)
    VALUES ('__test_pause_gate', 'test.pause.gate', '+254700000411', 'BBS Mall', 'active', 100, '1st Floor', 'P-1')
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee)
    VALUES (v_mid, 'Paused deal', 'https://img/x', true, true, NOW() + INTERVAL '6 hours', 50, 0, 30)
    RETURNING id INTO v_did;

  -- Record success in a flag rather than raising a sentinel.
  --
  -- The previous shape could not fail. It ran claim_deal, then
  -- `RAISE EXCEPTION 'expected deal_paused'` on success — but that sentinel was
  -- caught by its own `WHEN OTHERS`, and its message contains the substring
  -- `deal_paused`, so `v_err LIKE '%deal_paused%'` matched and the assertion
  -- passed. The follow-up "no redemption" assertion did not save it either: a
  -- caught exception rolls back the block's subtransaction, so the redemption
  -- claim_deal had just written was undone before it could be observed. Both
  -- assertions therefore passed whether or not the gate fired — a vacuous test
  -- guarding the one migration on this branch that blocks E2E.
  BEGIN
    PERFORM public.claim_deal(v_uid, v_did);
    v_claimed := TRUE;   -- reached only if NO exception was raised
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  ASSERT NOT v_claimed,
    'claim_deal ACCEPTED a claim on a paused deal — the deal_paused gate is not firing';

  ASSERT v_err IS NOT NULL AND v_err LIKE '%deal_paused%',
    format('paused claim must raise deal_paused, got: %s', COALESCE(v_err, '<no error>'));

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.redemptions WHERE deal_id = v_did
  ), 'paused deal must not create a redemption';

  -- Fixtures are committed by `psql -f`, so remove them rather than leaving
  -- __test_pause_gate rows to accumulate on every run against a shared database.
  DELETE FROM public.redemptions WHERE deal_id = v_did;
  DELETE FROM public.deals       WHERE id = v_did;
  DELETE FROM public.merchants   WHERE id = v_mid;
  DELETE FROM public.users       WHERE id = v_uid;

  RAISE NOTICE 'claim_deal_pause_gate_test: OK';
END $$;
