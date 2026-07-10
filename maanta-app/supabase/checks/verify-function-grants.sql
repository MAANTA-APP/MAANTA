-- ============================================================
-- Scriptable privilege check for SECURITY DEFINER functions.
--
-- Run against the live database (Supabase SQL editor, `psql`, or
-- `supabase db execute --file supabase/checks/verify-function-grants.sql`).
--
-- PASS condition: the query below returns ZERO rows.
-- Every returned row is a public-schema SECURITY DEFINER function
-- that anon or PUBLIC can execute — each one must either be fixed
-- with a grants migration or added to the allowlist below with a
-- written justification.
-- ============================================================

WITH allowlist(fname) AS (
  VALUES
    -- Intentionally anon-callable functions go here, one per row,
    -- with a comment justifying each. Currently: none.
    (NULL::text)
)
SELECT
  p.proname                                        AS function_name,
  pg_get_function_identity_arguments(p.oid)        AS args,
  CASE
    WHEN p.proacl IS NULL THEN 'PUBLIC (default acl)'
    ELSE array_to_string(ARRAY(
      SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
      FROM aclexplode(p.proacl) a
      WHERE a.privilege_type = 'EXECUTE'
        AND (a.grantee = 0 OR a.grantee::regrole::text = 'anon')
    ), ', ')
  END                                              AS offending_grantees
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef                                  -- SECURITY DEFINER only
  AND p.proname NOT IN (SELECT fname FROM allowlist WHERE fname IS NOT NULL)
  AND (
    p.proacl IS NULL                               -- default acl = PUBLIC execute
    OR EXISTS (
      SELECT 1 FROM aclexplode(p.proacl) a
      WHERE a.privilege_type = 'EXECUTE'
        AND (a.grantee = 0                          -- 0 = PUBLIC
             OR a.grantee::regrole::text = 'anon')
    )
  )
ORDER BY p.proname;
