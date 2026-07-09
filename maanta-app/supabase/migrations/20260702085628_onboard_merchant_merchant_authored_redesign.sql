-- Supersedes the agent-authenticated-caller mechanism from onboard_merchant_agent_attribution.
-- The merchant is always the authenticated submitter, on both self-serve and
-- agent-assisted paths. The agent is captured as attribution only, validated for
-- existence + active status, with no relationship check to the caller (there is
-- none -- the agent is not the caller in this model). Per DECISIONS_LOG.md
-- 2026-07-02, third revision.

ALTER TABLE public.merchants
  RENAME COLUMN onboarded_by_agent_id TO assisted_by_agent_id;

COMMENT ON COLUMN public.merchants.assisted_by_agent_id IS 'Attribution only -- the agent who assisted the merchant''s own onboarding submission on a shared tablet. Not the authenticated caller. Set when onboarding_mode = agent_assisted. Validated at onboarding time for existence + agents.is_active, not for any relationship to the caller.';

-- Same signature as the prior version (11 args) -- CREATE OR REPLACE correctly
-- replaces in place here; no overload risk since the parameter list is unchanged.
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
  v_assisted_by_agent_id UUID;
  v_agent_valid BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'unauthorized: no authenticated caller identity';
    END IF;

    IF v_caller_id = p_user_id THEN
      -- Merchant-authored submission: self-serve, or agent-assisted via attribution only.
      IF p_onboarding_agent_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM public.agents
          WHERE id = p_onboarding_agent_id
            AND is_active = TRUE
        ) INTO v_agent_valid;

        IF NOT v_agent_valid THEN
          RAISE EXCEPTION 'invalid_attribution: p_onboarding_agent_id does not reference an active agent';
        END IF;

        v_onboarding_mode := 'agent_assisted';
        v_assisted_by_agent_id := p_onboarding_agent_id;
      ELSE
        v_onboarding_mode := 'self_serve';
        v_assisted_by_agent_id := NULL;
      END IF;

      v_onboarded_by_user_id := v_caller_id;

    ELSIF v_caller_role = 'admin' THEN
      v_onboarding_mode := 'admin_assisted';
      v_onboarded_by_user_id := v_caller_id;
      v_assisted_by_agent_id := NULL;

    ELSE
      RAISE EXCEPTION 'unauthorized: caller must be the merchant being onboarded or an admin';
    END IF;
  ELSE
    -- service_role: trusted server-side context, no caller identity to check against.
    -- Attribution still derived only from parameters actually supplied.
    IF p_onboarding_agent_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.agents
        WHERE id = p_onboarding_agent_id
          AND is_active = TRUE
      ) INTO v_agent_valid;

      IF NOT v_agent_valid THEN
        RAISE EXCEPTION 'invalid_attribution: p_onboarding_agent_id does not reference an active agent';
      END IF;

      v_onboarding_mode := 'agent_assisted';
      v_assisted_by_agent_id := p_onboarding_agent_id;
    ELSE
      v_onboarding_mode := 'self_serve';
      v_assisted_by_agent_id := NULL;
    END IF;
    v_onboarded_by_user_id := p_user_id;
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
    onboarding_mode, onboarded_by_user_id, assisted_by_agent_id
  )
  VALUES (
    p_user_id, p_merchant_name, p_phone,
    NULLIF(p_email, ''), NULLIF(p_whatsapp, ''),
    p_node, p_w3w_address,
    NULLIF(p_floor, ''), NULLIF(p_unit_number, ''),
    NULLIF(p_entrance_notes, ''),
    'pending', 'standard',
    v_onboarding_mode, v_onboarded_by_user_id, v_assisted_by_agent_id
  )
  RETURNING id INTO v_merchant_id;

  -- Promote user role — same transaction
  UPDATE public.users
    SET role = 'merchant_admin'
    WHERE id = p_user_id;

  RETURN v_merchant_id;
END;
$function$;
