-- Admin-assisted onboarding: let a service_role caller declare the acting admin.
--
-- `merchants.onboarding_mode` has carried 'admin_assisted' in its CHECK since
-- 20260702083812, and `onboard_merchant` already produces it — but only on the
-- authenticated-caller path, where `current_user_role()` is 'admin' and
-- `current_user_id()` is the admin's own id.
--
-- Production has no such path. Clerk is the launch auth strategy, so a Next.js
-- route handler has no user-scoped Postgres identity: `src/lib/supabase/`
-- offers a cookie-based client and a service_role client, and nothing that
-- carries an admin's identity into Postgres. Every server-side write goes
-- through service_role, and the service_role branch of this function derives
-- attribution from parameters alone — it can only ever produce 'self_serve' or
-- 'agent_assisted', with `onboarded_by_user_id = p_user_id`.
--
-- So an admin onboarding a shop through the app today would be recorded as the
-- MERCHANT self-serving. That is a false statement in the one column that
-- exists to say who did what, on a table the dispute and fraud paths read.
-- Rather than write it and correct it afterwards in a second statement (a
-- non-atomic lie with a window), the service_role branch gains an explicit,
-- validated way to name the acting admin.
--
-- Shape of the change:
--   * new trailing parameter `p_admin_user_id uuid DEFAULT NULL` — additive, so
--     every existing 11-argument call site keeps working untouched;
--   * honoured ONLY on the service_role branch (the authenticated branch
--     already derives the admin from the real caller and must not be
--     overridable by a parameter);
--   * the named user must exist AND hold role 'admin', or the call raises. A
--     caller that can reach service_role could of course write anything, but
--     the function refuses to *stamp* an admin attribution it has not checked,
--     so the column keeps meaning what it says;
--   * mutually exclusive with agent attribution: an onboarding is admin-assisted
--     or agent-assisted, never both, and asking for both is a caller bug worth
--     failing loudly rather than silently preferring one.
--
-- Everything else — the merchant-authored guarantee on the authenticated path,
-- the already_merchant / merchant_exists guards, the role promotion, the
-- 'pending' status and 'standard' tier — is unchanged.

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
  p_onboarding_agent_id uuid DEFAULT NULL,
  p_admin_user_id uuid DEFAULT NULL
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
  v_admin_valid BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'unauthorized: no authenticated caller identity';
    END IF;

    -- p_admin_user_id is meaningless here: the acting admin is the caller, and
    -- accepting a parameter would let one admin's action be stamped as another's.
    IF p_admin_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_attribution: p_admin_user_id is only accepted from service_role';
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
    -- service_role: trusted server-side context, no caller identity to check
    -- against. Attribution is derived only from parameters actually supplied,
    -- and every one of them is validated before it is stamped.
    IF p_admin_user_id IS NOT NULL AND p_onboarding_agent_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_attribution: onboarding is admin-assisted or agent-assisted, not both';
    END IF;

    IF p_admin_user_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = p_admin_user_id
          AND role = 'admin'
      ) INTO v_admin_valid;

      IF NOT v_admin_valid THEN
        RAISE EXCEPTION 'invalid_attribution: p_admin_user_id does not reference an admin';
      END IF;

      v_onboarding_mode := 'admin_assisted';
      v_onboarded_by_user_id := p_admin_user_id;
      v_assisted_by_agent_id := NULL;

    ELSIF p_onboarding_agent_id IS NOT NULL THEN
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
      v_onboarded_by_user_id := p_user_id;

    ELSE
      v_onboarding_mode := 'self_serve';
      v_assisted_by_agent_id := NULL;
      v_onboarded_by_user_id := p_user_id;
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

  UPDATE public.users
     SET role = 'merchant_admin'
   WHERE id = p_user_id;

  RETURN v_merchant_id;
END;
$function$;

COMMENT ON FUNCTION public.onboard_merchant IS
  'Creates a pending merchant and promotes the user to merchant_admin. Attribution is never inferred from who happens to be calling: on the authenticated path the merchant must be the caller (self_serve, or agent_assisted when an active agent id is supplied), or an admin caller records admin_assisted under their own id. On the service_role path attribution comes from validated parameters only — p_admin_user_id must reference a real admin, p_onboarding_agent_id an active agent, and the two are mutually exclusive. p_admin_user_id added 2026-08-16 so admin-assisted onboarding is recordable from a Next.js route handler, which has no user-scoped Postgres identity under Clerk.';
