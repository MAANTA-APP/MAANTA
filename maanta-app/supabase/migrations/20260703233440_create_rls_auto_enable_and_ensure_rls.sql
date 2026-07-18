-- Reconcile out-of-band schema drift: rls_auto_enable() + ensure_rls.
--
-- These two objects were created directly on the live database (project
-- vcrfqsevompqjazbwzyh) outside the migration pipeline. The very next
-- migration (20260703233441_drop_undocumented_definer_objects.sql) REVOKEs
-- EXECUTE on public.rls_auto_enable(), which only succeeds if the function
-- already exists. On the live DB it does; on a from-scratch build
-- (`supabase start`, CI db-tests) it does not, so that REVOKE errored with
-- "function public.rls_auto_enable() does not exist" and the whole migration
-- chain failed.
--
-- This migration captures the exact live definitions so a from-scratch build
-- reproduces the live DB. It is timestamped one second BEFORE 233441 so the
-- function exists before the REVOKE runs. Every statement is idempotent
-- (CREATE OR REPLACE / DROP ... IF EXISTS), so re-applying against the live
-- DB — where these objects already exist — is a safe no-op-in-effect.
--
-- rls_auto_enable() auto-enables Row Level Security on any newly created
-- public table (fired by the ensure_rls event trigger on ddl_command_end).
-- Body copied verbatim from the live catalog.

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Event trigger that fires the function. Recreated idempotently: drop any
-- existing definition first (there is none on a fresh build; on the live DB
-- this replaces the identical trigger), then create it enabled on
-- ddl_command_end for the three table-creating command tags.
DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
