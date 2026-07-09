-- ============================================================
-- onboard_merchant(p_user_id, p_merchant_data JSONB)
--
-- Atomically:
--   1. Inserts a merchants row (status='pending', tier='standard')
--   2. Updates users.role to 'merchant_admin'
--
-- Both writes happen in one transaction. If either fails, both
-- roll back — no orphaned merchants row without a role, and no
-- role upgrade without a merchants row.
--
-- Called from app/merchant/onboard/actions.ts after all
-- validation (w3w format + API check) passes in app code.
-- ============================================================

CREATE OR REPLACE FUNCTION public.onboard_merchant(
  p_user_id        UUID,
  p_merchant_name  TEXT,
  p_phone          TEXT,
  p_email          TEXT,
  p_whatsapp       TEXT,
  p_node           TEXT,
  p_w3w_address    TEXT,
  p_floor          TEXT,
  p_unit_number    TEXT,
  p_entrance_notes TEXT
)
RETURNS UUID   -- returns the new merchant id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_merchant_id UUID;
  v_existing_merchant UUID;
  v_current_role TEXT;
BEGIN
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
    status, tier
  )
  VALUES (
    p_user_id, p_merchant_name, p_phone,
    NULLIF(p_email, ''), NULLIF(p_whatsapp, ''),
    p_node, p_w3w_address,
    NULLIF(p_floor, ''), NULLIF(p_unit_number, ''),
    NULLIF(p_entrance_notes, ''),
    'pending', 'standard'
  )
  RETURNING id INTO v_merchant_id;

  -- Promote user role — same transaction
  UPDATE public.users
    SET role = 'merchant_admin'
    WHERE id = p_user_id;

  RETURN v_merchant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.onboard_merchant(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onboard_merchant(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
