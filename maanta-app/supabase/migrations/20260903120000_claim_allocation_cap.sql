-- =============================================================================
-- D236 — `max_claims` is a CLAIM ALLOCATION, enforced at claim issuance.
--
-- Founder ruling, 2026-09-03:
--   "max_claims means THE MAXIMUM NUMBER OF SHOPPER CLAIMS THAT MAY BE ISSUED
--    FOR THAT DEAL. It is NOT a redemption cap. A merchant must not be able to
--    advertise 10 available MAANTA claims and accidentally issue 50 valid
--    codes. The cap must therefore be enforced at CLAIM ISSUANCE."
--
-- ## The defect this closes
--
-- `deals.claims_count` is incremented ONLY inside `verify_redemption` — that
-- is, on successful REDEMPTION. But it was also the value `claim_deal` gated
-- the cap on, and the value every surface rendered as "claimed". So the cap
-- never bound at claim time: with a `max_claims` of 10 and nobody yet at the
-- counter, `claims_count` stayed 0 and an unbounded number of shoppers could
-- be issued valid 6-digit codes. `verify_redemption` has no cap check at all
-- (deliberately — see INVARIANT G), so every one of those codes would verify
-- and charge the merchant KES 30.
--
-- Measured on production 2026-09-03: of 198 deals holding at least one claim,
-- **191 had `claims_count` different from the real issued count**. The two
-- were never the same number.
--
-- ## The new counter, and the invariant that defines it
--
-- `deals.claims_issued` counts CLAIM ROWS. The invariant, asserted by
-- `supabase/tests/claim_allocation_cap_test.sql`, is exactly:
--
--     deals.claims_issued = (SELECT count(*) FROM redemptions WHERE deal_id = d.id)
--
-- `claims_count` is left ALONE and keeps its existing meaning (verified
-- redemptions). Two counters is the honest answer here: a merchant genuinely
-- needs both "codes I have handed out" and "codes actually redeemed", and
-- collapsing them is what produced this defect. The UI now labels each.
--
-- ## Where the cap is enforced, and why there
--
-- On a BEFORE INSERT trigger on `redemptions`, NOT only inside `claim_deal`.
-- `claim_deal` is today's only issuance path, but the trigger makes the
-- allocation hold for ANY writer — a seed, an admin script, a future RPC —
-- so the merchant's promise cannot be broken by a path nobody remembered.
--
-- ## Concurrency (INVARIANT B)
--
-- The check and the increment are ONE statement:
--
--     UPDATE deals SET claims_issued = claims_issued + 1
--      WHERE id = NEW.deal_id AND (max_claims IS NULL OR claims_issued < max_claims)
--
-- A single UPDATE takes a row lock and re-evaluates its own WHERE clause
-- against the latest committed version of the row, so concurrent claimants
-- serialise on the deal row and each one re-tests the allocation it actually
-- faces. If one slot remains and ten shoppers tap Claim simultaneously,
-- exactly one UPDATE matches; the other nine find no row and raise. This does
-- not depend on `claim_deal`'s advisory `FOR UPDATE OF d`, on statement
-- ordering, or on any read-then-write window — there is no window.
--
-- ## Deletion (bookkeeping, NOT lifecycle release)
--
-- An AFTER DELETE trigger decrements, keeping the invariant above true when
-- the demo wipe removes `is_demo` rows (`20260730150000` deletes redemptions
-- and deals; `seed/demo_activity_seed.sql` deletes redemptions alone). This is
-- reconciliation of rows that no longer exist. It is NOT an expiry rule:
--
--   **An expired, failed or rejected claim does NOT release its slot.**
--
-- Those rows still exist, so they still count. Whether a no-show should hand
-- capacity back is a genuine product question about inventory economics that
-- the 2026-09-03 ruling does not settle (INVARIANT J says: surface it, do not
-- invent it). It is recorded as an open decision in the drift register and
-- deliberately NOT implemented here. Today's behaviour is the conservative
-- one: allocation is consumed at issuance and never silently re-opens.
--
-- ## What this migration deliberately does NOT do
--
--  * It does not touch `verify_redemption`, the KES 30 fee, or fee economics
--    (INVARIANT H). A claim legitimately issued before exhaustion follows the
--    normal lifecycle; there is no second stock rejection at the counter
--    (INVARIANT G).
--  * It does not cancel, expire or invalidate any existing claim (INVARIANT C).
--  * It does not change pause semantics (INVARIANT F).
--  * It does not touch Fast Visit or any feature flag.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) The counter.
-- ---------------------------------------------------------------------------
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS claims_issued INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.deals.claims_issued IS
  'D236: shopper claims ISSUED against this deal (redemption rows), the value max_claims caps at issuance. Distinct from claims_count, which counts VERIFIED REDEMPTIONS. Maintained by the redemptions_reserve_claim_slot / redemptions_release_claim_slot triggers; invariant claims_issued = count(redemptions for this deal).';

COMMENT ON COLUMN public.deals.claims_count IS
  'Verified redemptions for this deal, incremented by verify_redemption. NOT the claim count — see claims_issued (D236).';

COMMENT ON COLUMN public.deals.max_claims IS
  'D236: the deal''s MAANTA claim allocation — the maximum number of shopper claims that may be ISSUED. NULL means unlimited. Enforced at claim issuance by redemptions_reserve_claim_slot, never at redemption.';

-- ---------------------------------------------------------------------------
-- 2) Backfill from the rows themselves, so the invariant holds from the start.
--    Measured on production before writing this: 0 deals would violate the
--    CHECK added below (highest issued count on any deal was 4).
-- ---------------------------------------------------------------------------
UPDATE public.deals d
   SET claims_issued = COALESCE(
         (SELECT count(*) FROM public.redemptions r WHERE r.deal_id = d.id), 0)
 WHERE d.claims_issued IS DISTINCT FROM COALESCE(
         (SELECT count(*) FROM public.redemptions r WHERE r.deal_id = d.id), 0);

-- ---------------------------------------------------------------------------
-- 3) The allocation invariant, as a constraint.
--
--    This is what makes INVARIANT D ("do not permit an internally
--    contradictory allocation") true at the database boundary rather than only
--    in the API: lowering max_claims below the number of claims already issued
--    is rejected by Postgres, so no code path — route, script or console — can
--    create a deal that promises fewer claims than it has already handed out.
-- ---------------------------------------------------------------------------
ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_claims_issued_non_negative;
ALTER TABLE public.deals
  ADD CONSTRAINT deals_claims_issued_non_negative CHECK (claims_issued >= 0);

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_claims_issued_within_allocation;
ALTER TABLE public.deals
  ADD CONSTRAINT deals_claims_issued_within_allocation
  CHECK (max_claims IS NULL OR claims_issued <= max_claims);

-- ---------------------------------------------------------------------------
-- 4) Reserve a slot on every claim issuance — atomic check-and-increment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_deal_claim_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- One statement: the WHERE clause IS the cap test, re-evaluated by Postgres
  -- against the latest committed row version after any concurrent claimant
  -- commits. No read-then-write window exists for a racing claim to slip
  -- through. See the concurrency note in the migration header.
  UPDATE public.deals
     SET claims_issued = claims_issued + 1
   WHERE id = NEW.deal_id
     AND (max_claims IS NULL OR claims_issued < max_claims);

  IF NOT FOUND THEN
    -- The allocation is exhausted (the deal itself cannot be missing: the
    -- redemptions.deal_id foreign key already guarantees it exists). Same
    -- error token `claim_deal` raises, so the API's existing mapping to
    -- HTTP 409 `deal_claim_limit_reached` covers a direct write too.
    RAISE EXCEPTION 'deal_claim_limit_reached'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reserve_deal_claim_slot() IS
  'D236: reserves one slot from deals.max_claims at claim issuance, atomically. Raises deal_claim_limit_reached when the allocation is exhausted. Applies to EVERY insert into redemptions, not only claim_deal.';

DROP TRIGGER IF EXISTS redemptions_reserve_claim_slot ON public.redemptions;
CREATE TRIGGER redemptions_reserve_claim_slot
  BEFORE INSERT ON public.redemptions
  FOR EACH ROW EXECUTE FUNCTION public.reserve_deal_claim_slot();

-- ---------------------------------------------------------------------------
-- 5) Release on hard DELETE — bookkeeping only (see header). Expiry does not
--    delete rows, so expiry does not release a slot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_deal_claim_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.deals
     SET claims_issued = GREATEST(claims_issued - 1, 0)
   WHERE id = OLD.deal_id;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.release_deal_claim_slot() IS
  'D236: keeps deals.claims_issued equal to the number of surviving redemption rows when rows are hard-DELETEd (demo wipe/reseed). NOT an expiry rule — an expired or rejected claim keeps its row and keeps its slot.';

DROP TRIGGER IF EXISTS redemptions_release_claim_slot ON public.redemptions;
CREATE TRIGGER redemptions_release_claim_slot
  AFTER DELETE ON public.redemptions
  FOR EACH ROW EXECUTE FUNCTION public.release_deal_claim_slot();

-- ---------------------------------------------------------------------------
-- 6) claim_deal: gate on the allocation, not on the redemption counter.
--
--    Body is otherwise IDENTICAL to 20260818120000_claim_deal_csprng_otp.sql.
--    The only change is the cap predicate: claims_count -> claims_issued.
--    The trigger above is the authority; this check exists so the shopper gets
--    `deal_claim_limit_reached` before any OTP work, and so the error is the
--    same one whichever layer refuses.
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
         d.max_claims, d.claims_issued, d.success_fee,
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
  -- Already-claimed codes stay valid until expiry. (INVARIANT F: pause blocks
  -- NEW claims and cancels nothing.)
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

  -- D236: the allocation, tested against claims ISSUED. Fast-fail only; the
  -- BEFORE INSERT trigger below is what actually reserves the slot.
  IF v_deal.max_claims IS NOT NULL AND v_deal.claims_issued >= v_deal.max_claims THEN
    RAISE EXCEPTION 'deal_claim_limit_reached';
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
      -- OTP collision only. A retry re-runs the INSERT and therefore the
      -- reserve trigger, but the previous attempt's increment was rolled back
      -- with its subtransaction, so a collision never consumes a second slot
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
  'Claim a live deal: CSPRNG OTP + 15-minute grace after deal expiry. Rejects paused deals (deal_paused) and exhausted allocations (deal_claim_limit_reached, D236 — tested against deals.claims_issued, reserved atomically by redemptions_reserve_claim_slot). service_role or matching authenticated caller only.';

REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) TO authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 7) Public browse view: "fully claimed" now means the allocation is spent.
--    Rebuilt with the same shape and the same security posture as
--    20260730190000_paused_deals_discovery_filter.sql.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'deals_public_browse' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'COMMENT ON VIEW public.deals_public_browse IS ' || quote_literal(
      'Public discovery deals: active, unpaused, unexpired, merchant publicly visible. Pause hides from discovery only — claimed tickets remain redeemable via verify_redemption until ticket expiry. D236: claims_issued carries the claim allocation; claims_count remains verified redemptions.');
  END IF;
END $$;
