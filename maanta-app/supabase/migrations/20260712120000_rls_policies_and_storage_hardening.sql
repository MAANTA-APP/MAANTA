-- Launch-readiness security fix: RLS policies for organizations &
-- payment_webhook_failures + deal-images bucket listing hardening.
-- See maanta-app/supabase/migrations/20260712120000_rls_policies_and_storage_hardening.sql
-- All writes to these surfaces go through the service role, which bypasses
-- RLS, so these restrictions do not change existing app behavior.

-- 1. organizations: admin-only (matches users_admin / fraud_admin pattern)
DROP POLICY IF EXISTS organizations_admin ON public.organizations;
CREATE POLICY organizations_admin
  ON public.organizations
  FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- 2. payment_webhook_failures: enable RLS (idempotent) + admin-only
ALTER TABLE public.payment_webhook_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_webhook_failures_admin ON public.payment_webhook_failures;
CREATE POLICY payment_webhook_failures_admin
  ON public.payment_webhook_failures
  FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- 3. deal-images: drop the broad public LISTING policy (0025). Public
-- object URLs still serve without it; scoped upload/delete policies stay.
DROP POLICY IF EXISTS "deal_images_public_read" ON storage.objects;
