-- ============================================================
-- Launch-readiness security fix. Closes the three items flagged by the
-- Supabase security advisor that were in scope:
--   1. rls_enabled_no_policy  -> public.organizations            (INFO)
--   2. rls_enabled_no_policy  -> public.payment_webhook_failures (INFO)
--   3. public_bucket_allows_listing -> storage bucket deal-images (WARN)
--
-- Access model (traced from the codebase, not invented):
--   * Every privileged write to these surfaces already goes through the
--     service role (src/lib/supabase/service.ts), which BYPASSES RLS:
--       - organizations: no app code reads or writes it; it is a
--         back-office table (malls/brands/franchises) referenced by
--         merchants.organization_id. Managed by admins / service role.
--       - payment_webhook_failures: written only by the Stripe/IntaSend
--         webhook handlers via logWebhookFailure() using the service role
--         (src/lib/merchant-ledger.ts). Operational audit log, grouped
--         with fraud_events / audit_logs in the technical handoff.
--       - deal-images: uploaded, and cleaned up on failure, only
--         server-side in /api/deals (src/app/api/deals/route.ts) via the
--         service role. No browser-side storage calls exist in src/.
--
-- Because the service role bypasses RLS, the restrictions below do NOT
-- change any existing app behavior — they only govern what a direct
-- anon / authenticated PostgREST or Storage API client may do.
-- ============================================================

-- ------------------------------------------------------------
-- 1. organizations
--    RLS is already enabled (v3 baseline) but had zero policies, which
--    denies all anon/authenticated access while the service role still
--    works. Add an explicit admin-only policy, matching the existing
--    admin model for back-office tables (users_admin, fraud_admin).
--    No customer / merchant / agent path touches this table today, so
--    none is granted (least privilege). If a merchant dashboard later
--    needs to show its own organization's name, add a scoped SELECT
--    policy then rather than widening this one.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS organizations_admin ON public.organizations;
CREATE POLICY organizations_admin
  ON public.organizations
  FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ------------------------------------------------------------
-- 2. payment_webhook_failures
--    The creating migration (20260708231241) never enabled RLS in code
--    even though the live project has it on. Enable it here so the
--    migration history matches the live posture and a fresh provision is
--    safe (idempotent no-op where already enabled). Then grant admin-only
--    access, consistent with the sibling operational/audit table
--    fraud_events (fraud_admin is FOR ALL admin). End users get nothing;
--    the webhook handlers keep writing via the service role.
-- ------------------------------------------------------------
ALTER TABLE public.payment_webhook_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_webhook_failures_admin ON public.payment_webhook_failures;
CREATE POLICY payment_webhook_failures_admin
  ON public.payment_webhook_failures
  FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ------------------------------------------------------------
-- 3. deal-images storage bucket hardening
--    The advisor WARN (0025 public_bucket_allows_listing) is caused by
--    "deal_images_public_read": a broad SELECT policy TO public over the
--    whole bucket. On a PUBLIC bucket that policy is NOT needed to serve
--    images -- object URLs from getPublicUrl() are served through the
--    public object endpoint, which does not consult RLS. Its only effect
--    is to let any anon/authenticated client LIST and enumerate every
--    object (leaking merchant ids and all image paths). The app never
--    lists objects, so dropping it is safe and closes the WARN while the
--    shopper feed keeps rendering images from deals.image_url.
--
--    The scoped write policies ("deal_images_upload" / "deal_images_delete",
--    each restricted to admin or a merchant_admin's own {merchant_id}/
--    folder) are intentionally KEPT: they are not flagged, they encode
--    "merchants can only touch their own deal images," and they are
--    defense-in-depth for any future direct-from-browser upload UI. Today
--    all writes go through the service role and bypass them.
--
--    The bucket stays public: true because deals.image_url stores public
--    URLs that logged-out shoppers load directly from the feed. Making it
--    private would require switching the app to signed URLs and is out of
--    scope for this security fix.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "deal_images_public_read" ON storage.objects;
