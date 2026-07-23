-- C-1 / C-2 / C-3: strip authenticated write grants on core money-path tables.
--
-- Supabase default privileges grant INSERT/UPDATE/DELETE on every public table
-- to `authenticated`. RLS policies merchants_own, deals_merchant, and
-- redemptions_merchant are unrestricted FOR ALL with no column-level WITH CHECK,
-- so a stolen merchant JWT could PATCH privileged columns directly via PostgREST:
--   C-1 merchants  — tier, account_balance, trust_metric, status, is_shadow_banned
--   C-2 redemptions — status = 'success' (bypass verify_redemption + KES 30 fee)
--   C-3 deals      — boost_active, claims_count, is_active, success_fee, caps
--
-- Safe because the application never mutates these tables through the
-- anon/authenticated client. All server routes use createServiceClient()
-- (service_role) or SECURITY DEFINER RPCs (claim_deal, verify_redemption,
-- onboard_merchant, purchase_boost, move_boost). Verified table-by-table against
-- src/ on 2026-07-23. SELECT is preserved for authenticated so RLS-governed
-- reads remain possible if ever needed; the app currently reads via service_role.

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.merchants,
  public.deals,
  public.redemptions
FROM authenticated;
