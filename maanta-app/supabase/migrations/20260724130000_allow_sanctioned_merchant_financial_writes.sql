-- Fix a money-path regression introduced by
-- 20260723001651_lock_down_merchant_financial_columns (the drift back-fill of a
-- migration hand-applied to prod).
--
-- THE BUG: protect_merchant_financial_columns() blocks any change to a merchant
-- financial/status column unless auth.role() = 'service_role' (or is null). But
-- the app calls the money-path RPCs verify_redemption / purchase_boost /
-- move_boost with the SIGNED-IN user's client (see
-- src/app/api/redemptions/verify/route.ts and src/app/api/boosts/*), so inside
-- those SECURITY DEFINER functions auth.role() is still 'authenticated'. Their
-- legitimate internal writes then trip the guard:
--   verify_redemption → update_kpi_counters → recalculate_trust_metric
--     → UPDATE merchants SET trust_metric / is_featured …   ← blocked
--   verify_redemption → deduct_success_fee_or_record_arrears
--     → UPDATE merchants SET account_balance / outstanding_arrears  ← blocked
--   purchase_boost / move_boost → UPDATE merchants SET account_balance  ← blocked
-- i.e. every merchant-driven redemption verification (the KES 30 success-fee
-- path) and every boost purchase raises 'protected_column'. This is latent on
-- prod only because no live redemption has run since the trigger was applied;
-- the rollout would expose it on day one. security_hardening_test Scenario D
-- reproduces it. This forward migration applies to BOTH repo and prod (Phase B).
--
-- THE FIX (bypass flag): the guard still blocks *direct* client writes, but now
-- honours a session-local flag `app.allow_protected_merchant_write` that the
-- sanctioned SECURITY DEFINER entry-point RPCs carry. We attach that flag with
-- ALTER FUNCTION … SET (NOT a body rewrite — zero risk to the money-path SQL);
-- the SET clause turns the flag on for the whole call, INCLUDING nested trigger
-- functions (recalculate_trust_metric, deduct_success_fee_or_record_arrears),
-- and Postgres restores the previous value on exit, so it can never leak past
-- the RPC. Service-role/cron/admin paths already satisfy auth.role() =
-- 'service_role' and need no flag; onboard_merchant only INSERTs (this is a
-- BEFORE UPDATE trigger) so it is unaffected.

-- 1. Teach the guard to allow writes made within a sanctioned RPC.
create or replace function public.protect_merchant_financial_columns()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.role() is distinct from 'service_role'
     and auth.role() is not null
     -- Sanctioned SECURITY DEFINER money-path RPCs set this via ALTER FUNCTION …
     -- SET; it is scoped to the RPC call and restored on exit, so a direct
     -- client UPDATE (no such wrapper) never has it and stays blocked.
     and coalesce(current_setting('app.allow_protected_merchant_write', true), 'off') is distinct from 'on' then
    if new.account_balance     is distinct from old.account_balance
    or new.outstanding_arrears is distinct from old.outstanding_arrears
    or new.status              is distinct from old.status
    or new.tier                is distinct from old.tier
    or new.trust_metric        is distinct from old.trust_metric
    or new.is_shadow_banned    is distinct from old.is_shadow_banned
    or new.is_featured         is distinct from old.is_featured
    or new.elite_trial_active  is distinct from old.elite_trial_active
    or new.trial_ends_at       is distinct from old.trial_ends_at
    or new.grace_period_ends_at is distinct from old.grace_period_ends_at
    or new.user_id             is distinct from old.user_id
    or new.organization_id     is distinct from old.organization_id then
      raise exception 'protected_column: financial/status columns are service-role only';
    end if;
  end if;
  return new;
end;
$function$;

-- 2. Mark the authenticated-invoked money-path entry points as sanctioned. The
--    flag stays on for the duration of each call (and its nested trigger writes)
--    and is restored on return — no body changes, so the audited money-path
--    logic is untouched.
ALTER FUNCTION public.verify_redemption(uuid, text, text, boolean, text)
  SET app.allow_protected_merchant_write = 'on';
ALTER FUNCTION public.purchase_boost(uuid, uuid)
  SET app.allow_protected_merchant_write = 'on';
ALTER FUNCTION public.move_boost(uuid, uuid, uuid)
  SET app.allow_protected_merchant_write = 'on';
