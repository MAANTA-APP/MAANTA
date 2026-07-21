-- Clerk third-party auth bridge.
--
-- Clerk is now the authentication layer and is registered in the Supabase
-- dashboard as a third-party auth provider. Clerk mints the session JWT that
-- Supabase verifies; the Clerk user id arrives as the `sub` claim as an opaque
-- text id (e.g. "user_2ab...") — NOT a UUID. We store it on
-- public.users.clerk_user_id and re-point the identity helpers to prefer it,
-- keeping a UUID-guarded auth_uid fallback for legacy Supabase-Auth sessions
-- (see the helper comments below). Because every RLS policy and every authz-enforcing
-- SECURITY DEFINER RPC funnels through current_user_id() / current_user_role(),
-- re-pointing those two functions migrates the whole security model in place —
-- no policy or RPC bodies change.
--
-- Provisioning: the old on_auth_user_created trigger fired on auth.users
-- inserts, which never happen under Clerk. Mirror rows are created in the app
-- on first authenticated request (see src/lib/auth.ts ensureAppUser). The
-- trigger is left in place, inert, so any residual Supabase-Auth sign-up still
-- gets a row.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;

-- One Clerk identity ↔ one public.users row. A plain (non-partial) unique
-- index is used deliberately: Postgres treats NULLs as distinct, so legacy
-- rows with a NULL clerk_user_id are unconstrained, while the full index can
-- still serve as the arbiter for `ON CONFLICT (clerk_user_id)` upserts (a
-- partial index cannot, which is why the predicate is omitted).
CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_user_id_key
  ON public.users (clerk_user_id);

-- Resolve the caller's public.users row from the verified JWT `sub`, primarily
-- via Clerk (clerk_user_id) with a UUID-guarded legacy fallback (auth_uid).
--
-- Why dual-path:
--  * Clerk's `sub` is opaque text ("user_2ab…") → matches clerk_user_id.
--  * A legacy Supabase-Auth `sub` is a UUID → matches auth_uid.
-- The fallback compares auth_uid CAST TO TEXT against `sub` (never `sub::uuid`):
-- SQL does not guarantee short-circuit evaluation of OR/AND, so a `(sub)::uuid`
-- cast would be evaluated eagerly and RAISE on a Clerk text id even behind a
-- regex guard. `auth_uid::text = sub` can never throw — a UUID's ::text is its
-- canonical form, exactly what a UUID `sub` serialises to. Equality (not IS NOT
-- DISTINCT FROM) is deliberate: an unauthenticated request has sub = NULL, so
-- neither branch matches and the anon role never resolves to a legacy row with
-- a NULL clerk_user_id.
-- In Clerk-only production the fallback is simply never hit (sub is always
-- text); it exists so any residual Supabase-Auth session — and the SQL
-- regression suite, which authenticates by setting sub = users.auth_uid —
-- keeps resolving.
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.users
  WHERE clerk_user_id = (auth.jwt() ->> 'sub')
     OR auth_uid::text = (auth.jwt() ->> 'sub')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.users
  WHERE clerk_user_id = (auth.jwt() ->> 'sub')
     OR auth_uid::text = (auth.jwt() ->> 'sub')
  LIMIT 1;
$$;

-- Preserve the execute-grant hardening from
-- 20260630231949_harden_security_definer_functions.sql (CREATE OR REPLACE
-- keeps existing grants, but re-assert to be explicit and migration-order safe).
REVOKE EXECUTE ON FUNCTION public.current_user_id()   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_user_id()   TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

COMMENT ON COLUMN public.users.clerk_user_id IS
  'Clerk user id (JWT sub). Primary identity link now that Clerk is the auth '
  'provider; auth_uid is retained only for legacy Supabase-Auth rows.';
