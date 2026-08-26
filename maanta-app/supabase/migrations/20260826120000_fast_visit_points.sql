-- Fast Visit reward + MAANTA Points (founder-authorized engineering window,
-- 2026-08-26, package 2 of 3).
--
-- ## The product rule
--
-- Fast Visit measures CLAIM -> PHYSICAL ARRIVAL, not claim -> redemption. A
-- shopper who reaches the merchant within 15 minutes of claiming earns Fast
-- Visit ELIGIBILITY; MAANTA Points are awarded only after merchant staff
-- subsequently complete a legitimate successful redemption. The 15-minute
-- window is a REWARD window only — it is not claim expiry, not deal expiry,
-- not a redemption deadline. A claim whose reward window lapses redeems
-- normally; it simply earns no points.
--
-- Boundary, exact: arrived_at <= claimed_at + 15 minutes qualifies. One
-- microsecond later does not. Both timestamps are database-stamped —
-- `claimed_at` by its column DEFAULT (20260824130000), `arrived_at` by
-- `record_shopper_arrival` below — so a shopper's device clock is never an
-- input. Historical redemptions have `claimed_at` NULL (deliberately never
-- backfilled — see 20260824130000); NULL never becomes eligible.
--
-- ## Qualification is decided AT ARRIVAL, and it is immutable
--
-- `record_shopper_arrival` evaluates the whole qualification — feature gate
-- ON at that instant, claim time known, arrival inside the 15-minute window —
-- and persists the verdict as `redemptions.fast_visit_qualified_at` in the
-- same UPDATE that stamps `arrived_at`. The award RPC then REQUIRES that
-- persisted fact; it never re-derives qualification from the current gate
-- plus historical timestamps. Two consequences, both deliberate:
--
--  * an arrival made while the feature was OFF can NEVER become
--    reward-eligible later — flipping the gate ON does not retroactively
--    qualify older arrivals (they were not playing the game when they
--    walked in);
--  * an arrival that legitimately qualified while the feature was ON keeps
--    its eligibility even if the gate is turned OFF before staff verify —
--    earned eligibility is never erased.
--
-- ## What this migration deliberately does NOT touch
--
-- `claim_deal` and `verify_redemption` are unchanged. The award lives in its
-- own RPC called by the app AFTER a verify succeeds, because re-issuing the
-- guardian-era `verify_redemption` body to inline one INSERT would put the
-- busiest money function at risk for no atomicity we need: the award is
-- exactly-once by a real UNIQUE constraint (`reward_events.reference`), so a
-- crashed call between verify and award self-heals on the next idempotent
-- call. The KES 30 success-fee path is not touched in any way — points are
-- promotional loyalty rewards, carry NO cash value, are not withdrawable,
-- not transferable, and never rendered as money.
--
-- ## The ledger model
--
-- `reward_events` is APPEND-ONLY, imitating `merchant_transactions`: one row
-- per award, idempotency by UNIQUE reference ('fast_visit:<redemption_id>'),
-- checked inside the SECURITY DEFINER function via unique_violation in the
-- same transaction — the same shape whose absence gave the old app-side
-- ledger a TOCTOU race (see src/lib/merchant-ledger.ts). A shopper's balance
-- is derived (SUM), never a mutable integer.
--
-- No `is_demo` column here, on purpose: D188 proved a live-path demo flag
-- that nothing sets is worse than none. Demo-ness of a reward is derived by
-- joining `merchants.is_demo` / `deals.is_demo` through `redemption_id`,
-- exactly as the D188 ruling requires for redemptions themselves.
--
-- ## Config
--
-- * `fast_visit_points`  — the promotional award amount. Configurable so no
--   commercial number is hardcoded; the SQL fallback of 50 exists only for a
--   deleted row (mirrors deduct_success_fee_or_record_arrears' 30.00).
-- * `fast_visit_enabled` — feature gate, seeded 'false'. The shopper-facing
--   reward UI and the ARRIVAL-time qualification both respect it, so the
--   feature can merge dark and turn on only when merchant QRs are physically
--   at Node 0 counters (field safety: nothing mid-field-run changes until
--   the founder flips the row). The gate is read where qualification is
--   decided — at arrival — never at award time (see above).
--
-- Guard: supabase/tests/fast_visit_points_test.sql
--        maanta-app/src/lib/__tests__/fast-visit-window.test.ts

-- 1) Arrival evidence on the redemption. Nullable, NO default: NULL means
--    "never arrived via a MAANTA check-in", and only record_shopper_arrival
--    ever writes it (first arrival wins; it is never rewritten).
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz;

COMMENT ON COLUMN public.redemptions.arrived_at IS
  'When the shopper physically checked in at the merchant (server-stamped by '
  'record_shopper_arrival, first arrival wins, never rewritten). NULL = no '
  'MAANTA check-in recorded. 2026-08-26.';

-- 1b) The persisted Fast Visit qualification. Written ONLY by
--     record_shopper_arrival, in the same UPDATE as arrived_at, and ONLY
--     when the whole qualification held at that instant: feature gate ON,
--     claimed_at known, arrival <= claimed_at + 15 minutes. Immutable once
--     the first arrival is recorded (set or NULL, it never changes) — a
--     later gate flip in either direction rewrites nothing.
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS fast_visit_qualified_at timestamptz;

COMMENT ON COLUMN public.redemptions.fast_visit_qualified_at IS
  'The authoritative Fast Visit qualification fact, decided AT ARRIVAL by '
  'record_shopper_arrival: set (= arrived_at) only when fast_visit_enabled '
  'was ON at that instant, claimed_at was known, and the arrival landed '
  'within 15 minutes of the claim (inclusive). NULL = did not qualify. '
  'Immutable once the first arrival is recorded; award_fast_visit_points '
  'requires this fact and never re-derives qualification from the current '
  'gate + historical timestamps. 2026-08-26.';

-- 2) The append-only points ledger.
CREATE TABLE IF NOT EXISTS public.reward_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id),
  redemption_id UUID NOT NULL REFERENCES public.redemptions(id),
  merchant_id   UUID NOT NULL REFERENCES public.merchants(id),
  reward_type   TEXT NOT NULL CHECK (reward_type IN ('fast_visit')),
  points        INTEGER NOT NULL CHECK (points > 0),
  reference     TEXT NOT NULL UNIQUE,
  awarded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.reward_events IS
  'Append-only MAANTA Points ledger. One row per award; balances are derived '
  '(SUM), never stored. Idempotent per reference (fast_visit:<redemption_id>). '
  'Points are promotional loyalty rewards with NO cash value — never '
  'withdrawable, transferable, purchasable, or rendered as KES. Writes go '
  'through award_fast_visit_points only. 2026-08-26.';

CREATE INDEX IF NOT EXISTS idx_reward_events_user
  ON public.reward_events (user_id, awarded_at DESC);

ALTER TABLE public.reward_events ENABLE ROW LEVEL SECURITY;

-- Shoppers read their own rows; admins read all (support/dispute review).
-- The same posture as notifications/admin_ops_log: no client-side writes at
-- all — authenticated keeps SELECT only, inserts are SECURITY DEFINER /
-- service_role territory.
CREATE POLICY reward_events_own ON public.reward_events
  FOR SELECT USING (user_id = public.current_user_id());
CREATE POLICY reward_events_admin ON public.reward_events
  FOR SELECT USING (public.current_user_role() = 'admin');

REVOKE ALL ON TABLE public.reward_events FROM PUBLIC;
REVOKE ALL ON TABLE public.reward_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.reward_events FROM authenticated;
GRANT SELECT ON TABLE public.reward_events TO authenticated;
GRANT ALL ON TABLE public.reward_events TO service_role;

-- 3) Feature gate reader, mirroring public.is_demo_mode() exactly.
CREATE OR REPLACE FUNCTION public.fast_visit_enabled()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT lower(btrim(value)) = 'true'
       FROM public.app_config WHERE key = 'fast_visit_enabled'),
    FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.fast_visit_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fast_visit_enabled()
  TO anon, authenticated, service_role, postgres;

-- 4) Arrival recording. The ONLY writer of redemptions.arrived_at.
--
-- p_merchant_id is the merchant the shopper is physically standing at,
-- resolved server-side from the scanned counter QR token, never from the
-- request body. Requiring it here is what makes "arrival at merchant A"
-- unable to mark a claim held at merchant B — the same-merchant rule is
-- enforced where the timestamp is written, not left to callers.
--
-- SERVER-ONLY, deliberately (Codex P1 finding, 2026-08-26): the arrival's
-- whole evidentiary value is that the shopper's phone learned the merchant's
-- opaque qr_token by scanning the printed counter QR, and only the QR
-- check-in route sees and validates that token. An `authenticated` EXECUTE
-- grant would let any shopper stamp a qualifying arrival with a bare Data
-- API call using ids their own ticket already shows them — no token, no
-- scan, no visit. So clients cannot execute this at all; the route calls it
-- with the service client AFTER resolving a valid token, passing a
-- p_user_id derived from the authenticated session (never the body). The
-- claim-ownership, same-merchant, pending and unexpired checks below run
-- against p_user_id regardless of caller, so the service path does not
-- weaken them; the caller-identity check is kept as defence in depth for
-- any future non-service grant.
CREATE OR REPLACE FUNCTION public.record_shopper_arrival(
  p_user_id uuid,
  p_merchant_id uuid,
  p_redemption_id uuid
)
RETURNS TABLE(
  arrived_at timestamptz,
  fast_visit_eligible boolean,
  first_arrival boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller_id    uuid;
  v_user_id      uuid;
  v_merchant     uuid;
  v_status       text;
  v_expires_at   timestamptz;
  v_claimed_at   timestamptz;
  v_arrived_at   timestamptz;
  v_qualified_at timestamptz;
BEGIN
  -- Caller must BE the shopper (claim_deal's authorization shape).
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    v_caller_id := public.current_user_id();
    IF v_caller_id IS NULL OR v_caller_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'unauthorized: caller is not the shopper';
    END IF;
  END IF;

  SELECT r.user_id, r.merchant_id, r.status, r.expires_at, r.claimed_at,
         r.arrived_at, r.fast_visit_qualified_at
    INTO v_user_id, v_merchant, v_status, v_expires_at, v_claimed_at,
         v_arrived_at, v_qualified_at
    FROM public.redemptions r
    WHERE r.id = p_redemption_id
    FOR UPDATE;

  -- Same message for "no such row" and "someone else's row": a shopper must
  -- not be able to probe other people's redemption ids apart.
  IF NOT FOUND OR v_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'arrival_claim_not_found';
  END IF;
  IF v_merchant IS DISTINCT FROM p_merchant_id THEN
    RAISE EXCEPTION 'arrival_merchant_mismatch';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'arrival_claim_not_pending';
  END IF;
  -- An expired claim cannot be rescued by an arrival.
  IF v_expires_at < NOW() THEN
    RAISE EXCEPTION 'arrival_claim_expired';
  END IF;

  IF v_arrived_at IS NULL THEN
    -- Qualification is decided HERE, at the first arrival, from the state of
    -- the world at this instant: the feature gate must be ON, the claim time
    -- must be known (historical NULLs never qualify), and the arrival must
    -- land within 15 minutes of the claim (inclusive). The verdict persists
    -- with the arrival and is never revisited — flipping fast_visit_enabled
    -- later, in either direction, rewrites nothing.
    IF public.fast_visit_enabled()
       AND v_claimed_at IS NOT NULL
       AND NOW() <= v_claimed_at + INTERVAL '15 minutes'
    THEN
      v_qualified_at := NOW();
    ELSE
      v_qualified_at := NULL;
    END IF;
    UPDATE public.redemptions r
      SET arrived_at = NOW(),
          fast_visit_qualified_at = v_qualified_at
      WHERE r.id = p_redemption_id;
    v_arrived_at := NOW(); -- NOW() is transaction-stable: same instant as the UPDATE wrote
    first_arrival := TRUE;
  ELSE
    -- First arrival wins. A re-scan is fine (the queue may renew), but both
    -- the arrival evidence AND the qualification verdict are immutable — a
    -- re-scan after the gate flips ON must not upgrade an unqualified
    -- arrival, and a re-scan after it flips OFF must not erase a qualified
    -- one. v_qualified_at already holds the persisted verdict.
    first_arrival := FALSE;
  END IF;

  arrived_at := v_arrived_at;
  fast_visit_eligible := v_qualified_at IS NOT NULL;
  RETURN NEXT;
END;
$$;

-- Server-side only — like award_fast_visit_points, and for the same class of
-- reason: reachable exclusively through the QR check-in route, which is the
-- thing that proves token possession (see the block comment above).
REVOKE ALL ON FUNCTION public.record_shopper_arrival(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_shopper_arrival(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.record_shopper_arrival(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_shopper_arrival(uuid, uuid, uuid)
  TO service_role, postgres;

COMMENT ON FUNCTION public.record_shopper_arrival(uuid, uuid, uuid) IS
  'Records the shopper''s physical check-in on their own pending, unexpired '
  'claim at the merchant they are standing at, and decides Fast Visit '
  'qualification AT THIS INSTANT (gate ON + claimed_at known + within 15 '
  'minutes), persisting it as fast_visit_qualified_at. First arrival wins; '
  'idempotent; the verdict is immutable; never awards points (the QR scan '
  'itself must not — award_fast_visit_points does, after staff verification). '
  'SECURITY DEFINER, server-only: EXECUTE is service_role/postgres — a direct '
  'client call would bypass the QR-token possession the arrival is meant to '
  'evidence. p_user_id must be derived from the authenticated session by the '
  'caller; the claim-ownership check runs against it regardless. 2026-08-26.';

-- 5) The award. Exactly-once, callable idempotently from any trusted server
--    context. Requires the qualification fact PERSISTED at arrival time —
--    it never re-derives qualification from the current gate, so flipping
--    fast_visit_enabled after an arrival changes nothing in either
--    direction. The immutable timestamps are still re-checked as
--    belt-and-braces (they can never contradict a genuine verdict; the
--    check exists so a hand-crafted qualified_at with impossible timestamps
--    still refuses to pay).
CREATE OR REPLACE FUNCTION public.award_fast_visit_points(p_redemption_id uuid)
RETURNS TABLE(awarded boolean, points integer, balance bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id      uuid;
  v_merchant     uuid;
  v_status       text;
  v_claimed_at   timestamptz;
  v_arrived_at   timestamptz;
  v_qualified_at timestamptz;
  v_points       integer;
  v_inserted     boolean := FALSE;
BEGIN
  -- Row lock: a concurrent double-call serialises here, and the UNIQUE
  -- reference below makes the loser a no-op rather than a duplicate.
  SELECT r.user_id, r.merchant_id, r.status, r.claimed_at, r.arrived_at,
         r.fast_visit_qualified_at
    INTO v_user_id, v_merchant, v_status, v_claimed_at, v_arrived_at,
         v_qualified_at
    FROM public.redemptions r
    WHERE r.id = p_redemption_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reward_redemption_not_found';
  END IF;

  -- Configured promotional amount. TEXT column, so parse defensively: a
  -- malformed or missing row falls back to 50 rather than erroring the
  -- verify path; a deliberate '0' disables awarding without erroring.
  BEGIN
    SELECT value::integer INTO v_points
      FROM public.app_config WHERE key = 'fast_visit_points';
  EXCEPTION WHEN OTHERS THEN
    v_points := NULL;
  END;
  IF v_points IS NULL THEN v_points := 50; END IF;

  -- NO fast_visit_enabled() check here, deliberately: qualification was
  -- decided at arrival and persisted. Checking the gate again at award time
  -- is exactly the retroactivity bug this design forbids — it would deny a
  -- legitimately earned reward after the gate turns OFF, and (with the
  -- persisted fact absent) would have paid gate-OFF arrivals after it turned
  -- ON. v_points > 0 remains the operator's kill switch for NEW awards.
  IF v_points > 0
     AND v_status = 'success'
     AND v_qualified_at IS NOT NULL        -- the arrival-time verdict, required
     AND v_claimed_at IS NOT NULL          -- belt-and-braces: historical rows
     AND v_arrived_at IS NOT NULL          --   never eligible, no arrival no
     AND v_arrived_at <= v_claimed_at + INTERVAL '15 minutes'  --   reward, <=
  THEN
    BEGIN
      INSERT INTO public.reward_events
        (user_id, redemption_id, merchant_id, reward_type, points, reference)
      VALUES
        (v_user_id, p_redemption_id, v_merchant, 'fast_visit', v_points,
         'fast_visit:' || p_redemption_id::text);
      v_inserted := TRUE;
    EXCEPTION WHEN unique_violation THEN
      v_inserted := FALSE;  -- already awarded — replay, refresh, or retry
    END;
  END IF;

  awarded := v_inserted;
  points  := CASE WHEN v_inserted THEN v_points ELSE 0 END;
  SELECT COALESCE(SUM(e.points), 0) INTO balance
    FROM public.reward_events e WHERE e.user_id = v_user_id;
  RETURN NEXT;
END;
$$;

-- Server-side only. Unlike record_shopper_arrival there is no authenticated
-- grant: the app awards via the service client after verify_redemption
-- succeeds (and self-heals from the ticket success view). Nothing a shopper
-- or merchant can execute directly.
REVOKE ALL ON FUNCTION public.award_fast_visit_points(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_fast_visit_points(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.award_fast_visit_points(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.award_fast_visit_points(uuid)
  TO service_role, postgres;

COMMENT ON FUNCTION public.award_fast_visit_points(uuid) IS
  'Awards the configured Fast Visit points exactly once per redemption, only '
  'when: status = success AND fast_visit_qualified_at is set (the immutable '
  'verdict record_shopper_arrival persisted at arrival time — gate ON, claim '
  'time known, arrival within 15 minutes). Does NOT read fast_visit_enabled: '
  'a later gate flip neither retro-qualifies old arrivals nor erases earned '
  'eligibility. Idempotent by UNIQUE reference; safe to call repeatedly. '
  'Never touches merchant balances or the KES 30 success-fee path. '
  '2026-08-26.';

-- 6) Config rows. ON CONFLICT DO NOTHING: a re-run or an operator-tuned
--    value is never clobbered.
INSERT INTO public.app_config (key, value, notes) VALUES
  (
    'fast_visit_points',
    '50',
    'Promotional MAANTA Points per completed Fast Visit (arrival within 15 '
    'minutes of claim + verified redemption). Loyalty reward only — NO cash '
    'value, no KES conversion, never rendered as money. Tune freely; 0 '
    'disables awarding. Read by award_fast_visit_points. 2026-08-26.'
  ),
  (
    'fast_visit_enabled',
    'false',
    'Feature gate for the Fast Visit reward (shopper reward UI + points '
    'awarding). Seeded false so the feature ships dark; flip to true only '
    'when merchant counter QRs are physically printed at Node 0. Anything '
    'other than the exact string true is treated as disabled. 2026-08-26.'
  )
ON CONFLICT (key) DO NOTHING;
