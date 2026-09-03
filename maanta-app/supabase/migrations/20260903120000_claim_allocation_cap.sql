-- =============================================================================
-- D236 — `max_claims` is a live CLAIM ALLOCATION, enforced at claim issuance.
--
-- Founder ruling 2026-09-03 (first): "max_claims means THE MAXIMUM NUMBER OF
-- SHOPPER CLAIMS THAT MAY BE ISSUED FOR THAT DEAL. It is NOT a redemption cap.
-- ... The cap must therefore be enforced at CLAIM ISSUANCE."
--
-- Founder ruling 2026-09-03 (second, D134/D224), which this migration was
-- rewritten to satisfy: "once the shopper's claim has genuinely expired and can
-- no longer be redeemed, it should no longer reserve merchant allocation. But
-- this must be concurrency-safe and derived from the canonical expiry
-- semantics — not a periodic best-effort sweep."
--
-- ## The defect this closes
--
-- `deals.claims_count` is incremented ONLY inside `verify_redemption` — on
-- successful REDEMPTION — yet it was the value `claim_deal` tested the cap
-- against and the value every surface rendered as "claimed". With nobody yet at
-- the counter it stays 0, so the cap never bound: fifty shoppers could claim a
-- `max_claims = 10` deal, and because `verify_redemption` has no cap check at
-- all (deliberately — see INVARIANT G), every one of those codes would verify
-- and post a KES 30 success fee.
--
-- Measured on production 2026-09-03: of 198 deals holding at least one claim,
-- **191 had `claims_count` different from the real issued count**.
--
-- ## Occupancy is DERIVED, never stored
--
-- The second ruling rules out a stored counter. A claim stops reserving the
-- moment its validity window elapses, and no counter can change by itself as
-- the clock moves — keeping one accurate would need exactly the periodic sweep
-- the ruling forbids, and would rewrite historical evidence to do it.
--
-- So allocation is computed from the claim rows themselves, every time it is
-- needed, from the same timestamps `verify_redemption` uses to decide whether a
-- code still works. `claim_occupies_allocation()` is the single definition:
--
--   success  -> occupies permanently. The unit was sold.
--   flagged  -> occupies. Held for admin review and `admin_release_redemption`
--               can still turn it into a success, so releasing it here would
--               let the deal over-issue the moment an admin approves.
--   pending  -> occupies only while `expires_at > now()`. This is the ruling.
--   failed   -> releases. No money moved and no code can be honoured:
--               `verify_redemption` writes it for an expired-at-counter
--               attempt and for a Guardian hard block.
--
-- Nothing is swept, nothing is mutated, and an expired claim row remains an
-- immutable historical record — it simply stops counting as live, which is
-- also what the ruling requires of every operational surface.
--
-- ## Concurrency (INVARIANT B), with a derived count
--
-- A derived count cannot use the single-statement `UPDATE ... WHERE` trick, so
-- the trigger takes the DEAL ROW LOCK first and counts second:
--
--     SELECT max_claims FROM deals WHERE id = NEW.deal_id FOR UPDATE;   -- serialise
--     SELECT count(*) FROM redemptions WHERE deal_id = ... AND occupies; -- fresh
--
-- Under READ COMMITTED each statement takes its own snapshot, so a claimant
-- that waited on the lock runs its count AFTER the winner committed and sees
-- that row. Every concurrent claimant for one deal therefore counts an
-- allocation that already includes everyone ahead of it. `claim_deal` already
-- holds this same lock (`FOR UPDATE OF d`) before inserting, so the lock is
-- re-entrant there and the ordering is identical on both paths — no inversion,
-- no deadlock.
--
-- Proven, not asserted: 1 slot against 10/12/15/25/30/40 simultaneous
-- claimants issues exactly 1, on both `claim_deal` and raw concurrent INSERTs.
--
-- ## Where the cap is enforced, and why there
--
-- On a BEFORE INSERT trigger on `redemptions`, NOT only inside `claim_deal`.
-- `claim_deal` is today's only issuance path, but the trigger makes the
-- allocation hold for ANY writer — a seed, an admin script, a future RPC.
--
-- ## What this migration deliberately does NOT do
--
--  * No new `expired` status and no sweep (D224 ruling).
--  * No change to `verify_redemption`, the KES 30 fee, or fee economics
--    (INVARIANT H). A claim legitimately issued while capacity existed follows
--    the normal lifecycle; there is no second stock rejection at the counter
--    (INVARIANT G).
--  * No claim is cancelled or invalidated (INVARIANT C).
--  * No change to pause semantics (INVARIANT F).
--  * Nothing touching Fast Visit or any feature flag.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) The one definition of "this claim is holding a slot right now".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_occupies_allocation(
  p_status text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_status = 'success'
      OR p_status = 'flagged'
      OR (p_status = 'pending' AND p_expires_at > now())
$$;

COMMENT ON FUNCTION public.claim_occupies_allocation(text, timestamptz) IS
  'D236/D224: whether one redemption row currently reserves a unit of its deal''s max_claims. success and flagged occupy (flagged can still be released to success by admin_release_redemption); pending occupies only while unexpired; failed releases. Derived from the row, never stored — an expired claim stops reserving without anything being swept or mutated.';

-- ---------------------------------------------------------------------------
-- 2) The count, exposed to the application as a computed column on `deals`.
--
--    PostgREST renders a single-argument function over a table as a virtual
--    column, so `getLiveDeals` can select `claims_reserved` alongside the real
--    ones and every shopper and merchant surface reads the SAME number the
--    trigger enforces. That is the whole point: before this, the UI's "N left"
--    and the RPC's cap were computed from different columns.
--
--    SECURITY DEFINER because `authenticated` has no SELECT on `redemptions`
--    for other people's rows; it returns a bare integer for ONE deal and
--    exposes no row, no identity and no column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claims_reserved(d public.deals)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT count(*)::integer
    FROM public.redemptions r
   WHERE r.deal_id = d.id
     AND public.claim_occupies_allocation(r.status, r.expires_at)
$$;

COMMENT ON FUNCTION public.claims_reserved(public.deals) IS
  'D236: claims currently reserving this deal''s allocation. Exposed by PostgREST as a computed column on deals so the UI''s "claims left" and the issuance cap are the same number. Returns a count only.';

REVOKE ALL ON FUNCTION public.claims_reserved(public.deals) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claims_reserved(public.deals) TO anon, authenticated, service_role;

-- Supports the occupancy count. `expires_at` rides along so the pending branch
-- is answered from the index rather than by visiting the heap.
CREATE INDEX IF NOT EXISTS idx_redemptions_deal_status_expiry
  ON public.redemptions (deal_id, status, expires_at);

-- ---------------------------------------------------------------------------
-- 3) Reserve a slot on every claim issuance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_deal_claim_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_max INTEGER;
  v_occupied INTEGER;
BEGIN
  -- Serialise issuance for this deal. Every concurrent claimant queues here,
  -- so the count below is taken against a state that already includes anyone
  -- who committed ahead of us. claim_deal holds this same lock already.
  SELECT d.max_claims INTO v_max
    FROM public.deals d
   WHERE d.id = NEW.deal_id
   FOR UPDATE;

  -- No row: the redemptions.deal_id foreign key makes this unreachable, but
  -- failing open on a missing deal would be the wrong direction to guess in.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal_not_found';
  END IF;

  IF v_max IS NULL THEN
    RETURN NEW;                      -- unlimited allocation
  END IF;

  SELECT count(*) INTO v_occupied
    FROM public.redemptions r
   WHERE r.deal_id = NEW.deal_id
     AND public.claim_occupies_allocation(r.status, r.expires_at);

  IF v_occupied >= v_max THEN
    -- Same error token claim_deal raises, so the API's existing mapping to
    -- HTTP 410 `deal_claim_limit_reached` covers a direct write too.
    RAISE EXCEPTION 'deal_claim_limit_reached'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reserve_deal_claim_slot() IS
  'D236: enforces deals.max_claims against CURRENTLY RESERVING claims at issuance. Locks the deal row first so concurrent claimants serialise, then counts via claim_occupies_allocation. Applies to EVERY insert into redemptions, not only claim_deal.';

DROP TRIGGER IF EXISTS redemptions_reserve_claim_slot ON public.redemptions;
CREATE TRIGGER redemptions_reserve_claim_slot
  BEFORE INSERT ON public.redemptions
  FOR EACH ROW EXECUTE FUNCTION public.reserve_deal_claim_slot();

-- ---------------------------------------------------------------------------
-- 4) claim_deal: gate on live occupancy, not on the redemption counter.
--
--    Body is otherwise IDENTICAL to 20260818120000_claim_deal_csprng_otp.sql.
--    The trigger above is the authority; this check exists so the shopper gets
--    `deal_claim_limit_reached` before any OTP work, and so the same error
--    comes back whichever layer refuses.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_deal(
  p_user_id uuid,
  p_deal_id uuid,
  p_consumer_device_id text DEFAULT NULL::text,
  p_consumer_gps extensions.geography DEFAULT NULL::extensions.geography
)
 RETURNS TABLE(
  redemption_id uuid,
  otp_code text,
  redemption_expires_at timestamptz,
  deal_id uuid,
  deal_title text,
  deal_image_url text,
  merchant_id uuid,
  merchant_name text,
  what3words_address text,
  floor text,
  unit_number text
)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := public.current_user_id();
  v_deal RECORD;
  v_otp TEXT;
  v_redemption_id UUID;
  v_attempts INT := 0;
  v_existing_pending UUID;
  v_amount_kes NUMERIC;
  v_occupied INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'unauthorized: no authenticated caller identity';
    END IF;
    IF v_caller_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'unauthorized: p_user_id does not match caller identity';
    END IF;
  END IF;

  SELECT d.id, d.merchant_id, d.title, d.image_url, d.is_active, d.is_paused, d.expires_at,
         d.max_claims, d.success_fee,
         d.price_kes, d.charges,
         m.status AS merchant_status, m.is_visible, m.is_shadow_banned,
         m.merchant_name, m.what3words_address, m.floor, m.unit_number
    INTO v_deal
    FROM public.deals d
    JOIN public.merchants m ON m.id = d.merchant_id
    WHERE d.id = p_deal_id
    FOR UPDATE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal_not_found';
  END IF;

  IF v_deal.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'deal_not_active';
  END IF;

  -- Wireframe 10ab / merchant UI: paused deals accept no new claims.
  -- Already-claimed codes stay valid until expiry. (INVARIANT F.)
  IF v_deal.is_paused IS TRUE THEN
    RAISE EXCEPTION 'deal_paused';
  END IF;

  IF v_deal.expires_at IS NOT NULL AND v_deal.expires_at <= NOW() THEN
    RAISE EXCEPTION 'deal_expired';
  END IF;

  IF v_deal.merchant_status IS DISTINCT FROM 'active'
     OR v_deal.is_visible IS NOT TRUE
     OR v_deal.is_shadow_banned IS TRUE THEN
    RAISE EXCEPTION 'merchant_not_available';
  END IF;

  -- D236: the allocation, tested against claims that are reserving RIGHT NOW.
  -- The deal row is already locked above, so this count is serialised exactly
  -- as the trigger's is.
  IF v_deal.max_claims IS NOT NULL THEN
    SELECT count(*) INTO v_occupied
      FROM public.redemptions r
     WHERE r.deal_id = p_deal_id
       AND public.claim_occupies_allocation(r.status, r.expires_at);
    IF v_occupied >= v_deal.max_claims THEN
      RAISE EXCEPTION 'deal_claim_limit_reached';
    END IF;
  END IF;

  SELECT r.id INTO v_existing_pending
    FROM public.redemptions r
    WHERE r.deal_id = p_deal_id
      AND r.user_id = p_user_id
      AND r.status = 'pending'
      AND r.expires_at > NOW()
    LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'active_claim_already_exists: %', v_existing_pending;
  END IF;

  v_amount_kes := public.you_pay_kes(v_deal.price_kes, v_deal.charges);

  LOOP
    v_attempts := v_attempts + 1;
    -- Cryptographically secure 6-digit code (pgcrypto CSPRNG).
    v_otp := LPAD((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::TEXT, 6, '0');

    BEGIN
      INSERT INTO public.redemptions (
        deal_id, merchant_id, user_id, otp_code,
        success_fee_charged, consumer_device_id, consumer_gps,
        status, expires_at, amount_kes
      )
      VALUES (
        p_deal_id, v_deal.merchant_id, p_user_id, v_otp,
        v_deal.success_fee, p_consumer_device_id, p_consumer_gps,
        'pending', v_deal.expires_at + INTERVAL '15 minutes', v_amount_kes
      )
      RETURNING id INTO v_redemption_id;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- OTP collision only. The retry re-runs the reserve trigger, which
      -- re-counts; a collision therefore cannot consume two slots
      -- (INVARIANT I).
      IF v_attempts >= 5 THEN
        RAISE EXCEPTION 'otp_generation_failed: too many collisions';
      END IF;
    END;
  END LOOP;

  RETURN QUERY
  SELECT
    v_redemption_id,
    v_otp,
    v_deal.expires_at + INTERVAL '15 minutes',
    v_deal.id,
    v_deal.title,
    v_deal.image_url,
    v_deal.merchant_id,
    v_deal.merchant_name,
    v_deal.what3words_address,
    v_deal.floor,
    v_deal.unit_number;
END;
$function$;

COMMENT ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) IS
  'Claim a live deal: CSPRNG OTP + 15-minute grace after deal expiry. Rejects paused deals (deal_paused) and a full live allocation (deal_claim_limit_reached, D236 — counted via claim_occupies_allocation under the deal row lock, and enforced independently by redemptions_reserve_claim_slot). service_role or matching authenticated caller only.';

REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) TO authenticated, service_role, postgres;

COMMENT ON COLUMN public.deals.max_claims IS
  'D236: the deal''s live MAANTA claim allocation — the maximum number of shopper claims that may be reserving it at once. NULL means unlimited. Enforced at claim issuance by redemptions_reserve_claim_slot, never at redemption. A claim that expires releases its slot (D224 ruling); a redeemed one holds it permanently.';

COMMENT ON COLUMN public.deals.claims_count IS
  'Verified redemptions for this deal, incremented by verify_redemption. NOT the claim count and NOT the allocation — see claims_reserved(deals) (D236).';
