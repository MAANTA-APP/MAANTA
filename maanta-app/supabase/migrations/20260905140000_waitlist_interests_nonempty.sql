-- =============================================================================
-- Repair: an empty `interests` array must be rejected, and was not.
--
-- 20260905130000 wrote the bound as
--     CHECK (interests IS NULL OR array_length(interests, 1) BETWEEN 1 AND 8)
-- and `array_length` returns NULL for an empty array, not 0. NULL BETWEEN 1 AND 8
-- is NULL, and a CHECK that evaluates to NULL is *not* a violation — so
-- `ARRAY[]::TEXT[]` sailed through, and "none" could be spelled two ways, which
-- is exactly the ambiguity the comment on the column says it prevents.
--
-- Caught by scenario J of waitlist_signups_test.sql on the first CI run of the
-- branch, after the migration had already been applied to production. Nothing
-- had written an empty array in the meantime (the form sends NULL for "none"),
-- so this is a constraint swap with no data to repair. `cardinality` returns 0
-- for an empty array, which is the function this should have used.
--
-- Ledger read before choosing this version: production held 114 rows at
-- `20260905130000` on 2026-09-05.
-- =============================================================================

ALTER TABLE public.waitlist_signups
  DROP CONSTRAINT waitlist_signups_interests_check,
  ADD CONSTRAINT waitlist_signups_interests_nonempty
    CHECK (interests IS NULL OR cardinality(interests) BETWEEN 1 AND 8);
