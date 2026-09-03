-- =============================================================================
-- D171 — `users.is_blacklisted` becomes an enforced control.
--
-- Founder ruling 2026-09-03: "complete it now. Do not defer the broken/
-- incomplete blacklist control... determine what is_blacklisted is supposed to
-- PREVENT. Do not merely make the toggle writable while leaving it
-- behaviourally meaningless."
--
-- ## The defect
--
-- The column has existed since the baseline migration and the admin console
-- renders it as a status chip. Measured on production 2026-08-24 and re-measured
-- 2026-09-03: **zero** functions and **zero** RLS policies referenced it, and no
-- route could set it. An admin looking at the console saw a control-shaped label
-- that controlled nothing, and could not have changed it if they tried.
--
-- ## What blacklisting prevents — and what it deliberately does not
--
-- This implements option (a) from the D171 register row: enforce it where the
-- shopper side of fraud is already handled, mirroring how `is_shadow_banned`
-- already gates the MERCHANT side inside this very RPC. Blacklisting is the
-- shopper-side twin of shadow-banning, and it always was — that is why the
-- column sits beside `role` on `public.users`. No new product semantics are
-- invented here.
--
--   BLOCKED:     issuing a NEW claim. `claim_deal` raises `user_blacklisted`.
--
--   NOT BLOCKED: redeeming a claim the shopper already holds.
--
-- The second half is deliberate and is the frozen "verify-anyway" rule
-- (decisions log): the shopper experience is preserved at the counter and
-- disputes route to admin review afterwards. A blacklist applied while someone
-- is walking to the shop must not turn into a merchant arguing with a shopper
-- at the till about a code MAANTA issued. Counter-side abuse is already
-- Guardian's job (`guardian_evaluate` runs inside `verify_redemption` and can
-- soft- or hard-block), and that division of labour is left exactly as it is.
--
-- So the control's meaning is precise and small: **a blacklisted shopper gets no
-- new codes.** Existing codes run out on their own within their lifecycle.
--
-- Authorisation for setting the flag is admin-only and lives at the API
-- boundary (`/api/admin/customers/[id]/ops`, `requireAdminApi` + `logAdminOp`),
-- on the same pattern as merchant shadow-ban. The `users_own_row` RLS policy
-- grants a shopper ALL on their own row, so a shopper could otherwise clear
-- their own flag through PostgREST — section 2 below closes that.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) A blacklisted shopper cannot be issued a new claim.
--
--    Body is IDENTICAL to 20260903120000 (D236) except for the blacklist gate.
--    The check sits with the other "who are you and may you claim" tests, and
--    BEFORE any allocation slot is reserved, so a refused claim never consumes
--    a slot the merchant promised to somebody else.
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
  v_blacklisted BOOLEAN;
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

  -- D171. Checked for EVERY caller including service_role: the flag is about
  -- the shopper, not about which client asked. Server-side routes call this
  -- RPC with the service key on the shopper's behalf, so exempting
  -- service_role would exempt the only path production actually uses.
  SELECT u.is_blacklisted INTO v_blacklisted
    FROM public.users u WHERE u.id = p_user_id;
  IF v_blacklisted IS TRUE THEN
    RAISE EXCEPTION 'user_blacklisted';
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

  -- D236: the allocation, tested against claims reserving RIGHT NOW. The deal
  -- row is already locked above, so this count is serialised exactly as the
  -- reserve trigger's is. An expired claim no longer reserves (D224 ruling).
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
  'Claim a live deal: CSPRNG OTP + 15-minute grace after deal expiry. Refuses a blacklisted shopper (user_blacklisted, D171), a paused deal (deal_paused) and a full live allocation (deal_claim_limit_reached, D236 — counted via claim_occupies_allocation and enforced independently by redemptions_reserve_claim_slot). service_role or matching authenticated caller only.';

REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) TO authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 2) A shopper cannot clear their own blacklist flag.
--
--    `users_own_row` grants a shopper ALL on their own row, so without this a
--    blacklisted shopper could PATCH `is_blacklisted = false` through PostgREST
--    and undo the control from their phone.
--
--    Scoped to `is_blacklisted` ALONE. `role` is already covered by
--    `prevent_self_role_escalation` (20260702003248) and identity columns by
--    `prevent_identity_self_change` (D142, 20260819200000). Re-checking role
--    here would be a second place to enforce one rule, which is a second place
--    for it to drift — so this trigger deliberately does one thing and names
--    the neighbours that do the rest.
--
--    service_role and admin are exempt: that is how the admin route writes it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_self_blacklist_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.is_blacklisted IS DISTINCT FROM OLD.is_blacklisted THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND public.current_user_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'unauthorized: cannot change is_blacklisted';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_self_blacklist_change() IS
  'D171: users.is_blacklisted may only be changed by an admin or service_role. Without this, users_own_row (ALL on self) lets a blacklisted shopper clear their own flag through PostgREST. Mirrors prevent_self_role_escalation, which owns the role column.';

DROP TRIGGER IF EXISTS users_privilege_columns_immutable ON public.users;
DROP TRIGGER IF EXISTS prevent_self_blacklist_change_trigger ON public.users;
CREATE TRIGGER prevent_self_blacklist_change_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_blacklist_change();

DROP FUNCTION IF EXISTS public.enforce_user_privilege_columns_immutable();

COMMENT ON COLUMN public.users.is_blacklisted IS
  'D171: admin-only shopper block. TRUE means claim_deal refuses to issue NEW claims (user_blacklisted). Deliberately does NOT block redeeming an already-issued claim — verify-anyway is a frozen rule and counter-side abuse is Guardian''s job. Set via /api/admin/customers/[id]/ops; guarded by prevent_self_blacklist_change.';

-- ---------------------------------------------------------------------------
-- 3) Auditability — `admin_ops_log` must be able to record the action.
--
--    Blacklisting is the first admin action whose target is a USER, and the
--    target_type CHECK did not allow that value. Without this the audit insert
--    fails; `logAdminOp` is best-effort and swallows the error, so the block
--    would have applied with no durable record of who applied it — precisely
--    the accountability gap an enforcement control must not have.
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_ops_log
  DROP CONSTRAINT IF EXISTS admin_ops_log_target_type_check;
ALTER TABLE public.admin_ops_log
  ADD CONSTRAINT admin_ops_log_target_type_check
  CHECK (target_type = ANY (ARRAY[
    'merchant'::text, 'deal'::text, 'redemption'::text,
    'fraud_event'::text, 'agent_task'::text, 'user'::text
  ]));
