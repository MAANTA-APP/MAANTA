-- Browser geolocation replaces what3words as the self-serve location method
-- (D162, founder ruling 2026-08-24). Coordinates become MAANTA's canonical
-- store-location data; what3words survives as optional enrichment.
--
-- WHY. `/merchant/onboard` step 2 blocked on a what3words lookup and offered no
-- alternative, so when the what3words account went over quota (HTTP 402
-- QuotaExceeded — D162) self-serve merchant onboarding could not be completed
-- at all. A third party's billing state must not be able to close the front
-- door of the product. The merchant is standing at their own shop entrance with
-- a phone that already knows where it is; that reading is better evidence of
-- where the shop is than three words typed from a sign, and it costs nothing
-- per lookup.
--
-- WHAT THIS IS NOT. This does not touch approval: `onboard_merchant` still
-- inserts `status = 'pending'`, and only /api/admin/merchants/[id]/approve
-- flips it. It does not touch money, the KES 30 success fee, the claim gate, or
-- the D158 contact rules. `merchants_contact_present` is untouched.
--
-- SHAPE
--   * `what3words_address` becomes NULLABLE — it was the only thing forcing a
--     provider call into the critical path.
--   * `merchants_location_present` replaces that NOT NULL with the invariant
--     that actually matters: a shop must be findable by SOMETHING. Coordinates
--     or three words; either satisfies it, neither does not. Without this,
--     dropping NOT NULL would silently permit locationless shops, which is the
--     defect D162 describes on the admin-assisted path ("Map pin unavailable").
--   * `merchants_lat_lng_range` rejects coordinates outside WGS84 (and NaN,
--     which Postgres sorts above every finite value, so BETWEEN excludes it).
--     `merchants_lat_lng_pair` from 20260726120000 already forbids half a pair.
--   * `onboard_merchant` gains `p_lat` / `p_lng` so the location is written in
--     the SAME statement as the merchant row. Previously the route inserted the
--     shop and then UPDATEd coordinates onto it, logging any failure and
--     carrying on — a shop with no location was a swallowed error away, and now
--     it is a constraint violation instead.
--
-- SIGNATURE — read this before editing (D106, and the trap that bit D158).
-- This DROPs the TWELVE-argument function (20260823130000, `p_admin_user_id`
-- trailing) and creates a FOURTEEN-argument one. It is a drop-and-create, not
-- an added overload with defaults: two overloads make every existing call
-- ambiguous ("function public.onboard_merchant(...) is not unique"), which is
-- how 20260816020000 first failed CI and what a first draft of 20260823130000
-- nearly shipped. Exactly one overload must survive — asserted in
-- supabase/tests/merchant_location_coordinates_test.sql.
--
-- The two new parameters are appended and default to NULL, so every existing
-- named-parameter caller (the admin-assisted route, three SQL suites) keeps
-- working unchanged and simply supplies no coordinates.
--
-- No existing row changes: every current merchant has a what3words address (the
-- column was NOT NULL until now), so `merchants_location_present` holds for all
-- of them, and both seeded nodes are in Nairobi, inside the range CHECK.

ALTER TABLE public.merchants
  ALTER COLUMN what3words_address DROP NOT NULL;

-- A shop nobody can find is not a shop. Coordinates OR three words.
ALTER TABLE public.merchants
  DROP CONSTRAINT IF EXISTS merchants_location_present;
ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_location_present
  CHECK (
    what3words_address IS NOT NULL
    OR (lat IS NOT NULL AND lng IS NOT NULL)
  );

-- Canonical data earns a domain check. NaN fails this too: Postgres orders NaN
-- above every finite value, so `NaN BETWEEN -90 AND 90` is false.
ALTER TABLE public.merchants
  DROP CONSTRAINT IF EXISTS merchants_lat_lng_range;
ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_lat_lng_range
  CHECK (
    (lat IS NULL AND lng IS NULL)
    OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
  );

COMMENT ON COLUMN public.merchants.what3words_address IS
  'Optional what3words address for the shop. Enrichment since D162 — nullable, '
  'best-effort, and never on the critical path: a provider outage or quota '
  'exhaustion must not be able to block onboarding. lat/lng are canonical.';
COMMENT ON COLUMN public.merchants.lat IS
  'WGS84 latitude — canonical store location since D162, captured by browser '
  'geolocation at the shop entrance and confirmed by the merchant.';
COMMENT ON COLUMN public.merchants.lng IS
  'WGS84 longitude — canonical store location since D162, captured by browser '
  'geolocation at the shop entrance and confirmed by the merchant.';

DROP FUNCTION IF EXISTS public.onboard_merchant(
  uuid, text, text, text, text, text, text, text, text, text, uuid, uuid
);

CREATE FUNCTION public.onboard_merchant(
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
  p_admin_user_id uuid DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL
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
  -- D162: same treatment for the now-optional address. A '' reaching the column
  -- would satisfy merchants_location_present while pointing nowhere.
  v_w3w TEXT := NULLIF(btrim(COALESCE(p_w3w_address, '')), '');
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

  -- D162 guards, named for the same reason: a CHECK violation reaches the route
  -- as an opaque 500, and "your shop needs a location" is something the merchant
  -- standing in the mall can actually act on.
  IF (p_lat IS NULL) <> (p_lng IS NULL) THEN
    RAISE EXCEPTION 'invalid_coordinates: latitude and longitude must both be set or both omitted';
  END IF;

  IF p_lat IS NOT NULL AND NOT (
    p_lat BETWEEN -90 AND 90 AND p_lng BETWEEN -180 AND 180
  ) THEN
    RAISE EXCEPTION 'invalid_coordinates: outside the WGS84 range';
  END IF;

  IF v_w3w IS NULL AND p_lat IS NULL THEN
    RAISE EXCEPTION 'location_required: shop coordinates or a what3words address are required';
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
    node, what3words_address, lat, lng, floor, unit_number, entrance_notes,
    status, tier,
    onboarding_mode, onboarded_by_user_id, assisted_by_agent_id
  )
  VALUES (
    p_user_id, p_merchant_name, v_phone,
    v_email, NULLIF(p_whatsapp, ''),
    p_node, v_w3w, p_lat, p_lng,
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

-- DROP discards the old function's grants, so unlike 20260823130000 (which used
-- CREATE OR REPLACE and could re-assert them) these are load-bearing: without
-- them PUBLIC would inherit Postgres's default EXECUTE on the new function and
-- the 20260816020000 lockdown would be silently undone.
REVOKE EXECUTE ON FUNCTION public.onboard_merchant(
  uuid, text, text, text, text, text, text, text, text, text, uuid, uuid,
  double precision, double precision
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.onboard_merchant(
  uuid, text, text, text, text, text, text, text, text, text, uuid, uuid,
  double precision, double precision
) TO authenticated, service_role;
