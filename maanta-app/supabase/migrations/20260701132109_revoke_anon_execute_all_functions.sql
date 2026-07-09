-- ============================================================
-- Revoke EXECUTE from anon on all privileged MAANTA functions.
--
-- Supabase re-applies default grants in some migration contexts.
-- This migration explicitly revokes anon access on every
-- SECURITY DEFINER function that should be authenticated-only
-- or internal-only.
--
-- Run after any migration that creates/replaces a function to
-- confirm anon cannot call privileged RPCs directly.
-- ============================================================

-- Auth helpers: authenticated only
REVOKE EXECUTE ON FUNCTION public.current_user_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon;

-- Trigger functions: internal only (no public access needed)
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_trust_metric(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_trust_metric(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_trial_expiry() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_trial_expiry() FROM authenticated;

-- Guardian: internal only (dead code until explicitly wired)
REVOKE EXECUTE ON FUNCTION public.guardian_check(UUID,UUID,TEXT,GEOGRAPHY,TEXT,NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.guardian_check(UUID,UUID,TEXT,GEOGRAPHY,TEXT,NUMERIC) FROM authenticated;

-- Billing RPCs: authenticated only (not anon)
REVOKE EXECUTE ON FUNCTION public.increment_deal_claims(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_success_fee_or_record_arrears(UUID, NUMERIC) FROM anon;

-- Onboarding + activation: authenticated only (not anon)
REVOKE EXECUTE ON FUNCTION public.onboard_merchant(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_merchant(UUID,UUID,BOOLEAN) FROM anon;

-- Re-confirm authenticated grants are still in place
GRANT EXECUTE ON FUNCTION public.current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_deal_claims(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_success_fee_or_record_arrears(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboard_merchant(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_merchant(UUID,UUID,BOOLEAN) TO authenticated;
