-- D164 — give a redemption an explicit CLAIM timestamp.
--
-- ## Why
--
-- `/admin` and `/founder` both computed "Claims (7d)" as
--   from("redemptions").select("id",{count:"exact"}).gte("created_at", since7d)
-- but `public.redemptions` has never had a `created_at` column. Its only
-- timestamps are `expires_at` (set at claim, but it is the DEAL's end plus the
-- 15-minute grace, not a claim time) and `redeemed_at` (set at verification).
--
-- The consequences differ per surface and both were observed in production on
-- 2026-08-23, minutes after a real claim and verification:
--
--   * `/admin` has no read-failure guard, so the PostgREST error collapsed
--     through `(claims7d ?? 0)` into a convincing **0** displayed next to
--     "Verified (7d) 1" and "Success fees (7d) KES 30".
--   * `/founder` DOES have the D149 guard, and because the broken query shares
--     a Promise.all with every other metric, its error tripped that guard and
--     took the WHOLE dashboard down — every visit rendered "Could not load the
--     dashboard. This is a read error, not zeroed metrics."
--
-- Claims-minus-verified is the claim-to-visit conversion: the signal that says
-- shoppers are interested but not walking in. It is the sharpest early Node 0
-- measurement and it was uncomputable, because nothing recorded WHEN a claim
-- happened.
--
-- ## The change
--
-- One nullable `claimed_at timestamptz`, added in two statements on purpose:
--
--   1. ADD COLUMN with NO default — so existing rows stay NULL. Postgres 11+
--      backfills an ADD COLUMN ... DEFAULT across every existing row, which
--      here would stamp thousands of historical redemptions with the migration
--      timestamp: a fabricated claim time, on a money-adjacent audit record.
--      The founder's instruction was explicit — do not invent data to make
--      historical dashboards look complete.
--   2. SET DEFAULT now() afterwards — so every FUTURE insert is stamped by the
--      database, on every path (claim_deal, demo seeding, any future writer),
--      without the value ever being client-supplied.
--
-- ## Why `claim_deal` is deliberately NOT modified
--
-- The column default already guarantees "every new claim writes claimed_at
-- exactly once", database-authoritative, for every insert path. Replacing
-- `claim_deal` to name the column explicitly would buy nothing and would mean
-- re-issuing a function whose body is load-bearing and hard-won: it carries the
-- D25 `deal_paused` gate (20260730180000), the CSPRNG OTP draw (20260818120000),
-- the amount snapshot, the 15-minute grace and the collision-retry loop. The
-- cheapest correct change is the one that does not touch it.
--
-- Nothing else writes or reads `claimed_at` yet, so this is additive and safe
-- to apply while the app is serving: old code ignores the column, new code
-- filters on it.
--
-- ## What is NOT done here
--
-- No immutability trigger. `verify_redemption` updates status / redeemed_at /
-- fee columns and never touches `claimed_at`, and `authenticated` has no write
-- grant on this table (D123), so the realistic writers are the sanctioned RPCs
-- alone. A BEFORE UPDATE trigger on the busiest money table would be new
-- machinery guarding a path nothing currently takes; the guarantee is asserted
-- by test instead — supabase/tests/redemptions_claimed_at_test.sql.
--
-- Guard: supabase/tests/redemptions_claimed_at_test.sql
--        maanta-app/src/lib/__tests__/claims-metric.test.ts

-- 1) No default here: historical rows must stay NULL rather than be stamped
--    with the migration time. See the note above — this ordering is the point.
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- 2) Future inserts are stamped by the database, not the caller.
ALTER TABLE public.redemptions
  ALTER COLUMN claimed_at SET DEFAULT now();

-- The KPI filters `claimed_at >= now() - 7 days`; without this it is a seq scan
-- over every redemption ever, and the table grows ~70 demo rows a day.
CREATE INDEX IF NOT EXISTS idx_redemptions_claimed_at
  ON public.redemptions (claimed_at);

-- Record WHEN tracking began, in the same transaction that starts it.
--
-- Without this the dashboards cannot tell three different situations apart,
-- and all three render as "0":
--   * nobody claimed anything this week (a real, meaningful zero);
--   * the query failed (now caught by the read-failure guards);
--   * the 7-day window reaches back further than tracking does.
-- The third is the one that misleads during the pilot's first week: a small
-- number reads as low demand rather than short history. Deriving it from
-- MIN(claimed_at) would be wrong too — that is the first CLAIM, not the start
-- of tracking, so a quiet first day would silently move the boundary.
INSERT INTO public.app_config (key, value, notes)
VALUES (
  'claims_tracking_started_at',
  now()::text,
  'When redemptions.claimed_at started being recorded (migration 20260823140000). '
  'Claims counts are only complete from this instant; every redemption claimed '
  'before it has claimed_at NULL and is invisible to them. The dashboards read '
  'this to label the KPI honestly while the 7-day window still reaches past it. D164.'
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.redemptions.claimed_at IS
  'When the shopper claimed this deal. Database-stamped via DEFAULT now() on '
  'insert - never client-supplied, never rewritten by verification, rejection '
  'or expiry. NULL for every row created before 20260823140000: those claim '
  'times are unknowable and were deliberately not fabricated, so "Claims (7d)" '
  'is authoritative only from that migration forward. D164.';
