-- Restores agent-assisted merchant onboarding per DECISIONS_LOG.md 2026-07-02, without
-- reopening the "any authenticated user can onboard anyone" hole closed earlier this
-- session. Three explicit, auditable paths only: self_serve, agent_assisted, admin_assisted.
--
-- New attribution columns are deliberately distinct from the pre-existing
-- merchants.onboarded_by / onboarded_at, which record who ACTIVATED the merchant
-- (set inside activate_merchant) -- a different lifecycle moment. Not touched here.

ALTER TABLE public.merchants
  ADD COLUMN onboarding_mode text NOT NULL DEFAULT 'self_serve'
    CHECK (onboarding_mode IN ('self_serve', 'agent_assisted', 'admin_assisted')),
  ADD COLUMN onboarded_by_user_id uuid REFERENCES public.users(id),
  ADD COLUMN onboarded_by_agent_id uuid REFERENCES public.agents(id);

COMMENT ON COLUMN public.merchants.onboarding_mode IS 'How this merchant was onboarded: self_serve, agent_assisted, or admin_assisted. Frozen 2026-07-02.';
COMMENT ON COLUMN public.merchants.onboarded_by_user_id IS 'The logged-in actor (public.users.id) who submitted the onboarding — merchant themself, the assisting agent, or the admin. Distinct from onboarded_by (activation-time attribution).';
COMMENT ON COLUMN public.merchants.onboarded_by_agent_id IS 'Set only when onboarding_mode = agent_assisted. References the assisting agent''s own agents.id row, validated at onboarding time.';

CREATE OR REPLACE FUNCTION public.onboard_merchant(
  p_user_id uuid,
  p_merchant_name text,
  p_phone text,
  p_email text,
  p_whatsapp text,
  p_node text,
  p_w3w_address text,
  p_floor text,
  p_unit_number text,
  p_entrance_notes text,
  p_onboarding_agent_id uuid DEFAULT NULL
)
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
  v_onboarding_mode TEXT;
  v_onboarded_by_user_id UUID;
  v_onboarded_by_agent_id UUID;
  v_agent_owns_row BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'unauthorized: no authenticated caller identity';
    END IF;

    -- Path 1: self-serve
    IF v_caller_id = p_user_id THEN
      IF p_onboarding_agent_id IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_onboarding_mode: p_onboarding_agent_id must be null for self-serve onboarding';
      END IF;
      v_onboarding_mode := 'self_serve';
      v_onboarded_by_user_id := v_caller_id;
      v_onboarded_by_agent_id := NULL;

    -- Path 2: agent-assisted
    ELSIF v_caller_role = 'agent' THEN
      IF p_onboarding_agent_id IS NULL THEN
        RAISE EXCEPTION 'invalid_onboarding_mode: p_onboarding_agent_id is required for agent-assisted onboarding';
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.agents
        WHERE id = p_onboarding_agent_id
          AND user_id = v_caller_id
          AND is_active = TRUE
      ) INTO v_agent_owns_row;

      IF NOT v_agent_owns_row THEN
        RAISE EXCEPTION 'unauthorized: p_onboarding_agent_id does not match an active agent row owned by the caller';
      END IF;

      v_onboarding_mode := 'agent_assisted';
      v_onboarded_by_user_id := v_caller_id;
      v_onboarded_by_agent_id := p_onboarding_agent_id;

    -- Path 3: admin-assisted
    ELSIF v_caller_role = 'admin' THEN
      v_onboarding_mode := 'admin_assisted';
      v_onboarded_by_user_id := v_caller_id;
      v_onboarded_by_agent_id := NULL;

    ELSE
      RAISE EXCEPTION 'unauthorized: caller does not satisfy self-serve, agent-assisted, or admin-assisted onboarding rules';
    END IF;
  ELSE
    -- service_role: trusted server-side context, no caller identity to check against.
    -- Attribution still derived from the parameters actually supplied, never defaulted blindly.
    IF p_onboarding_agent_id IS NOT NULL THEN
      v_onboarding_mode := 'agent_assisted';
      v_onboarded_by_user_id := NULL;
      v_onboarded_by_agent_id := p_onboarding_agent_id;
    ELSE
      v_onboarding_mode := 'self_serve';
      v_onboarded_by_user_id := p_user_id;
      v_onboarded_by_agent_id := NULL;
    END IF;
  END IF;

  -- Guard: check user exists and isn't already a merchant
  SELECT role INTO v_current_role
    FROM public.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF v_current_role IN ('merchant_admin', 'merchant_staff') THEN
    RAISE EXCEPTION 'already_merchant';
  END IF;

  -- Guard: no existing merchants row for this user
  SELECT id INTO v_existing_merchant
    FROM public.merchants WHERE user_id = p_user_id LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'merchant_exists';
  END IF;

  -- Insert merchants row
  INSERT INTO public.merchants (
    user_id, merchant_name, phone, email, whatsapp,
    node, what3words_address, floor, unit_number, entrance_notes,
    status, tier,
    onboarding_mode, onboarded_by_user_id, onboarded_by_agent_id
  )
  VALUES (
    p_user_id, p_merchant_name, p_phone,
    NULLIF(p_email, ''), NULLIF(p_whatsapp, ''),
    p_node, p_w3w_address,
    NULLIF(p_floor, ''), NULLIF(p_unit_number, ''),
    NULLIF(p_entrance_notes, ''),
    'pending', 'standard',
    v_onboarding_mode, v_onboarded_by_user_id, v_onboarded_by_agent_id
  )
  RETURNING id INTO v_merchant_id;

  -- Promote user role — same transaction
  UPDATE public.users
    SET role = 'merchant_admin'
    WHERE id = p_user_id;

  RETURN v_merchant_id;
END;
$function$;
