CREATE OR REPLACE FUNCTION public.increment_deal_claims(p_deal_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_new_count INTEGER;
BEGIN
  UPDATE public.deals
    SET claims_count = claims_count + 1, updated_at = NOW()
    WHERE id = p_deal_id
    RETURNING claims_count INTO v_new_count;
  RETURN v_new_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_deal_claims(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_deal_claims(UUID) TO authenticated;
