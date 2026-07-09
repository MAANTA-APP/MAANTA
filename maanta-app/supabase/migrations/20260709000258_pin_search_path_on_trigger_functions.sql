-- Clears the Supabase "function_search_path_mutable" security lints by
-- pinning search_path on the six trigger functions that lacked it.
ALTER FUNCTION public.enforce_deal_limit() SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.set_deal_expiry() SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.archive_expired_deal() SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.compute_audit_composite() SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.update_kpi_counters() SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.recalculate_trust_after_audit() SET search_path TO 'public', 'pg_temp';
