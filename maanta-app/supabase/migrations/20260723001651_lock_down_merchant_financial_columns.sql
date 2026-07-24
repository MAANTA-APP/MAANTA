-- Lock down merchant financial / status columns to service_role only.
--
-- PROVENANCE (drift back-fill, 2026-07-24): this migration was applied directly
-- to the production project (ref axrrslqssmbngbataejg) on 2026-07-23 but never
-- committed to the repo, so `supabase migration list` showed it as REMOTE-only.
-- The SQL below is reconstructed verbatim from the live objects
-- (pg_get_functiondef / pg_get_triggerdef) so the repo is once again the source
-- of truth for the schema. Because prod already records version 20260723001651
-- in supabase_migrations.schema_migrations, `supabase db push` SKIPS it on prod
-- (no re-run); this file exists so fresh databases — CI `db-tests`, staging, any
-- rebuild — reproduce prod's exact state, in the correct filename order (after
-- 20260722200000, before 20260723120000).
--
-- What it does: a BEFORE UPDATE trigger on public.merchants that rejects any
-- change to money / status / tier / trust / trial columns unless the caller is
-- service_role (or an internal, role-less context such as another SECURITY
-- DEFINER routine where auth.role() is null). Ordinary authenticated/anon
-- sessions can never move a wallet balance, arrears, trust metric, ban/feature
-- flags, tier, or trial state by writing the row directly — those transitions
-- must go through the vetted SECURITY DEFINER RPCs. This is defense-in-depth
-- alongside the later 20260723120000_revoke_authenticated_writes_core_tables.
--
-- NOTE (security advisor): as applied on prod, this function keeps the default
-- PUBLIC EXECUTE grant, so the Supabase linter flags
-- 0028/0029 (anon/authenticated can execute it via /rest/v1/rpc). It is a
-- trigger function — invoking it directly over PostgREST has no useful effect
-- (NEW/OLD are unset, so it errors) — so the risk is cosmetic. This file
-- reproduces prod faithfully (grant left as-is); if we want to clear the
-- advisor, do it as a SEPARATE forward migration that revokes EXECUTE from
-- anon/authenticated on BOTH prod and the repo, so the two never diverge again.

create or replace function public.protect_merchant_financial_columns()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.role() is distinct from 'service_role' and auth.role() is not null then
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

-- Idempotent trigger (re)creation so this file is safe to apply to a fresh DB.
drop trigger if exists trg_protect_merchant_financial_columns on public.merchants;
create trigger trg_protect_merchant_financial_columns
  before update on public.merchants
  for each row execute function public.protect_merchant_financial_columns();
