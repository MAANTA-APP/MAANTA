-- Atomic lead capture: advisory lock per normalized shop name prevents the
-- TOCTOU race where two agents pass the live-lock SELECT and both INSERT.

CREATE OR REPLACE FUNCTION public.capture_lead(
  p_agent_id uuid,
  p_shop_name text,
  p_owner_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_unit_number text DEFAULT NULL,
  p_what3words_address text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE(lead_id uuid, locked_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_shop text;
  v_lead_id uuid;
  v_locked_until timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized: service_role only';
  END IF;

  v_shop := lower(trim(p_shop_name));
  IF v_shop = '' THEN
    RAISE EXCEPTION 'shop_name_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lead_capture:' || v_shop));

  IF EXISTS (
    SELECT 1 FROM public.leads l
    WHERE lower(trim(l.shop_name)) = v_shop
      AND l.status = 'locked'
      AND l.locked_until > NOW()
  ) THEN
    RAISE EXCEPTION 'shop_locked';
  END IF;

  INSERT INTO public.leads (
    agent_id, shop_name, owner_name, phone, unit_number, what3words_address, notes
  )
  VALUES (
    p_agent_id,
    trim(p_shop_name),
    p_owner_name,
    p_phone,
    p_unit_number,
    p_what3words_address,
    p_notes
  )
  RETURNING id, public.leads.locked_until INTO v_lead_id, v_locked_until;

  RETURN QUERY SELECT v_lead_id, v_locked_until;
END;
$function$;

COMMENT ON FUNCTION public.capture_lead IS
  'Agent lead capture with per-shop advisory lock (closes TOCTOU on concurrent inserts). service_role only.';

REVOKE ALL ON FUNCTION public.capture_lead(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_lead(uuid, text, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.capture_lead(uuid, text, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.capture_lead(uuid, text, text, text, text, text, text) TO service_role, postgres;
