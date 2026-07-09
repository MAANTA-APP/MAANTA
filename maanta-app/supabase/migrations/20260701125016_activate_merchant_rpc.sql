-- ============================================================
-- activate_merchant(p_merchant_id, p_admin_user_id, p_grant_elite_trial)
--
-- Atomically:
--   1. Sets merchant status = 'active'
--   2. Optionally grants 30-day Elite trial (first 100 BBS Mall merchants)
--   3. Records who activated and when (onboarded_by, onboarded_at)
--
-- Called from admin merchant activation UI.
-- p_grant_elite_trial = TRUE for the first 100 merchants launch promotion.
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_merchant(
  p_merchant_id      UUID,
  p_admin_user_id    UUID,   -- public.users.id of the admin performing the action
  p_grant_elite_trial BOOLEAN DEFAULT FALSE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_merchant_status TEXT;
  v_agent_id        UUID;
BEGIN
  -- Confirm merchant exists and is pending
  SELECT status INTO v_merchant_status
    FROM public.merchants WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  IF v_merchant_status = 'active' THEN
    RAISE EXCEPTION 'already_active';
  END IF;

  -- Look up agent id for the admin user (admin may also be an agent)
  SELECT id INTO v_agent_id FROM public.agents WHERE user_id = p_admin_user_id LIMIT 1;

  -- Activate the merchant
  UPDATE public.merchants
  SET
    status       = 'active',
    onboarded_by = v_agent_id,   -- NULL if admin has no agent row — acceptable
    onboarded_at = NOW(),
    updated_at   = NOW()
  WHERE id = p_merchant_id;

  -- Grant Elite trial if requested (launch promotion — first 100 BBS Mall merchants)
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
$$;

REVOKE EXECUTE ON FUNCTION public.activate_merchant(UUID, UUID, BOOLEAN) FROM PUBLIC;
-- Admin-only: called from admin server action which uses the authenticated client.
-- The calling user's role is verified in the server action before this RPC fires.
GRANT EXECUTE ON FUNCTION public.activate_merchant(UUID, UUID, BOOLEAN) TO authenticated;
