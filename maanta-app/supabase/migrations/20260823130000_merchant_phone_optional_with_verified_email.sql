-- Owner phone becomes OPTIONAL for a merchant whose account carries a verified
-- email (D158, founder ruling 2026-08-23, option B).
--
-- Why: the email-primary ruling (decisions log 2026-08-22, sixth entry) made
-- email the only production auth path for Node 0 — Clerk phone sign-in is a
-- paid feature MAANTA is not buying. Self-serve onboarding never followed:
-- `/merchant/onboard` step 1 held Continue disabled until Owner phone was
-- filled and `merchants.phone` was NOT NULL, so the E2E merchant could not
-- self-onboard on email alone and had to be created through the
-- admin-assisted path. This is the merchant twin of D154, which made the same
-- move for staff seats one migration earlier.
--
-- WHAT THIS IS NOT. `merchants.phone` is contact detail, not an access-control
-- input. It is displayed as the shop's contact and it PREFILLS the M-Pesa
-- top-up field — a prefill only, since /api/topup re-validates whatever is
-- submitted. Nothing links, authenticates or authorises on it: staff linking
-- keys on `users.phone`/`users.email` (a different table and column), and no
-- notification path reads this column at all (D109 corrected the comment that
-- claimed otherwise). So relaxing it weakens no guard — unlike D154, which had
-- to argue that email carries the same PROOF phone does, because that column
-- really does gate access.
--
-- The gate for omitting it lives in the route, not here: the API allows a
-- missing phone only when `public.users.email` is set for the submitting
-- account, and that column is written from `verifiedPrimaryEmail()` alone and
-- frozen against its holder by D142 — so "has an email" means "has a verified
-- email" by construction. The DB's job is narrower and stated below.
--
-- SIGNATURE: this replaces the TWELVE-argument function established by
-- 20260816020000 (`p_admin_user_id` trailing). It deliberately does NOT
-- resurrect the eleven-argument overload that 20260702085628 created and
-- 20260816020000 dropped: two overloads with defaults make every existing
-- call ambiguous ("function ... is not unique"), which is how that file first
-- failed CI. The body below is 20260816020000's, changed only where D158
-- requires it — read the CURRENT function before editing, never an older
-- migration that happens to describe one (D106).
--
-- Shape:
--   * `phone` becomes NULLABLE.
--   * A CHECK keeps at least one contact channel present, so a shop can never
--     exist that nobody could ever call or write to. Mirrors
--     `merchant_staff_contact_present` from D154.
--   * `onboard_merchant` normalises '' → NULL and raises an explicit
--     `contact_required` instead of letting the CHECK surface as a bare 500.
--
-- No existing row changes: every current merchant has a phone (the column was
-- NOT NULL until now), so the CHECK holds for all of them on creation.
-- Nothing here touches money, the KES 30 success fee, or the claim gate.

ALTER TABLE public.merchants
  ALTER COLUMN phone DROP NOT NULL;

-- A shop with neither channel is unreachable dead data, not a valid merchant.
ALTER TABLE public.merchants
  DROP CONSTRAINT IF EXISTS merchants_contact_present;
ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_contact_present
  CHECK (phone IS NOT NULL OR email IS NOT NULL);

COMMENT ON COLUMN public.merchants.phone IS
  'Shop contact number, and the M-Pesa top-up prefill (a prefill only — '
  '/api/topup re-validates what is submitted). Contact detail, NOT an '
  'access-control input: nothing links or authenticates on it. Optional since '
  'D158 when the submitting account has a verified email; '
  'merchants_contact_present keeps at least one channel on every row.';

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
  -- D158: '' and '   ' are absence, not a contact detail.
  v_phone TEXT := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_email TEXT := NULLIF(btrim(COALESCE(p_email, '')), '');
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

  -- D158 guard: a shop must keep at least one contact channel. Raised here
  -- so the route can return an actionable 400 instead of the
  -- merchants_contact_present CHECK surfacing as an unhandled 500.
  IF v_phone IS NULL AND v_email IS NULL THEN
    RAISE EXCEPTION 'contact_required: a phone or an email is required';
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
    p_user_id, p_merchant_name, v_phone,
    v_email, NULLIF(p_whatsapp, ''),
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

-- CREATE OR REPLACE on an existing object preserves its grants, so the
-- 20260816020000 lockdown (no PUBLIC/anon EXECUTE) still stands. Re-asserted
-- rather than assumed, and qualified by signature because an unqualified
-- reference would be ambiguous if an overload ever reappears.
REVOKE EXECUTE ON FUNCTION public.onboard_merchant(
  uuid, text, text, text, text, text, text, text, text, text, uuid, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.onboard_merchant(
  uuid, text, text, text, text, text, text, text, text, text, uuid, uuid
) TO authenticated, service_role;
