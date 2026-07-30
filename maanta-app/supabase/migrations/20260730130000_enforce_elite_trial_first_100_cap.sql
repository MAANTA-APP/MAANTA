-- Enforce the frozen launch offer's cap: "First 100 BBS Mall merchants get a
-- 30-day free Elite trial" (Notion "Frozen Scope & Rules"; decisions log
-- 2026-07-30 — closes open decision D2 from docs/skills/truth-audit-2026-07-30.md).
--
-- BEHAVIOURAL CHANGE, on an explicit founder ruling. Before this migration the
-- cap and the BBS-Mall scope existed only in the frozen rule and in public copy:
-- `activate_merchant` granted a 30-day trial whenever `p_grant_elite_trial` was
-- true, with no counter and no node check, and `/api/admin/plans/[id]`
-- (`grant-trial`) set the trial columns directly, bypassing the RPC entirely.
-- /pricing now advertises the cap, so it has to actually hold.
--
-- Design, and why:
--
-- 1. A DURABLE marker, not current state. `elite_trial_granted_at` is stamped
--    once and never cleared. Counting `elite_trial_active = TRUE` would be wrong:
--    the columns are cleared on downgrade and on mark-paid, so slots would be
--    silently recycled and far more than 100 merchants could receive the offer
--    over time. A consumed slot stays consumed.
--
-- 2. A TRIGGER, not just the RPC. The cap is enforced wherever a trial is
--    granted, so the admin plans route cannot bypass it. Enforcing only inside
--    `activate_merchant` would leave the documented bypass open while letting us
--    claim the cap was enforced.
--
-- 3. The two paths fail DIFFERENTLY, on purpose:
--      * `activate_merchant` (the launch offer) checks first and, when the offer
--        is exhausted or the merchant is off-node, activates the merchant on
--        Standard and skips the trial. Activation must never fail because a promo
--        ran out — the merchant going live is the important half. This mirrors
--        the Node 0 opening credit, which also no-ops silently when its cap fills.
--      * A direct grant (admin plans route) RAISES. There the admin explicitly
--        asked for this merchant to get a trial, so silently not doing it would
--        be worse than an error; they need to know the offer is exhausted.
--
-- 4. Demo rows are excluded from the count. Rehearsal merchants are not launch
--    merchants and must not consume real slots.
--
-- 5. No launch-window check. The frozen rule caps the offer by count and node
--    and says nothing about a date, unlike the opening credit which explicitly
--    reuses `node0_launch_period_ends_at`. Adding a window would be inventing a
--    rule; if the founder wants one, it is a new decisions-log entry.
--
-- Rollback:
--   DROP TRIGGER trg_enforce_elite_trial_cap ON public.merchants;
--   DROP FUNCTION public.enforce_elite_trial_cap();
--   DROP FUNCTION public.elite_trial_slot_available(uuid);
--   DROP FUNCTION public.elite_trial_cap_status();
--   -- then re-apply activate_merchant from 20260720120000_security_hardening.sql
--   -- (leave elite_trial_granted_at in place: dropping it destroys the record of
--   --  which merchants already consumed a slot, which cannot be reconstructed).

-- ---------------------------------------------------------------------------
-- 1) The durable slot marker.
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS elite_trial_granted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.merchants.elite_trial_granted_at IS
  'When this merchant was first granted an Elite trial. Stamped once by trg_enforce_elite_trial_cap and NEVER cleared — it is the durable record of a consumed launch-offer slot, so downgrading or converting to paid does not free the slot for another merchant. NULL = this merchant has never had a trial.';

CREATE INDEX IF NOT EXISTS idx_merchants_elite_trial_granted
  ON public.merchants(node, elite_trial_granted_at)
  WHERE elite_trial_granted_at IS NOT NULL;

-- Backfill: merchants that already have (or have had) a trial must count against
-- the cap, otherwise enforcement starts from a false zero and the first 100 slots
-- are handed out a second time. `trial_ends_at IS NOT NULL` catches merchants
-- whose trial has since expired or been converted, not just currently-active ones.
UPDATE public.merchants
   SET elite_trial_granted_at = COALESCE(onboarded_at, created_at, NOW())
 WHERE elite_trial_granted_at IS NULL
   AND (elite_trial_active = TRUE OR trial_ends_at IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2) The cap itself, in config so ops can read it without a deploy.
-- ---------------------------------------------------------------------------
INSERT INTO public.app_config (key, value, notes)
VALUES (
  'elite_trial_merchant_cap',
  '100',
  'Max number of merchants at the launch node (app_config.node0_launch_node) who may receive the 30-day Elite trial launch offer. Frozen at 100 by the Notion "Frozen Scope & Rules" launch offer — change only on an explicit new docs/maanta-decisions-log.md entry, and remember /pricing advertises this number publicly. 0 disables the offer entirely. Counted against merchants.elite_trial_granted_at, which is never cleared, so a slot is consumed for good.'
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Cap status — one place that counts, so the RPC, the trigger and any admin
--    surface can never disagree about how many slots are left.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.elite_trial_cap_status()
RETURNS TABLE (cap INT, granted INT, remaining INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cap         INT;
  v_launch_node TEXT;
  v_granted     INT;
BEGIN
  SELECT value::INT INTO v_cap FROM public.app_config WHERE key = 'elite_trial_merchant_cap';
  SELECT value       INTO v_launch_node FROM public.app_config WHERE key = 'node0_launch_node';
  v_cap         := COALESCE(v_cap, 100);
  v_launch_node := COALESCE(v_launch_node, 'BBS Mall');

  SELECT COUNT(*) INTO v_granted
    FROM public.merchants
   WHERE elite_trial_granted_at IS NOT NULL
     AND node = v_launch_node
     AND is_demo = FALSE;

  RETURN QUERY SELECT v_cap, v_granted, GREATEST(0, v_cap - v_granted);
END;
$$;

COMMENT ON FUNCTION public.elite_trial_cap_status IS
  'Launch-offer Elite trial slots: (cap, granted, remaining) for the launch node. Counts merchants.elite_trial_granted_at (durable — a consumed slot is never freed), excluding demo rows. Single source of the count for elite_trial_slot_available and enforce_elite_trial_cap.';

-- ---------------------------------------------------------------------------
-- 4) Is this specific merchant allowed a trial right now?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.elite_trial_slot_available(p_merchant_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_node        TEXT;
  v_granted_at  TIMESTAMPTZ;
  v_is_demo     BOOLEAN;
  v_launch_node TEXT;
  v_status      RECORD;
BEGIN
  SELECT node, elite_trial_granted_at, is_demo
    INTO v_node, v_granted_at, v_is_demo
    FROM public.merchants WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Already consumed a slot: re-granting to the SAME merchant is always allowed
  -- and costs nothing extra. Without this, a merchant whose trial was ended and
  -- restarted would burn a second slot.
  IF v_granted_at IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  -- Rehearsal data is not the launch offer and is not capped by it.
  IF v_is_demo THEN
    RETURN TRUE;
  END IF;

  -- The cap is scoped to the launch node by the frozen rule ("first 100 BBS Mall
  -- merchants"). A merchant at another node is outside the offer, so the offer's
  -- cap has no claim on them; product scope is single-mall, so this is currently
  -- theoretical but must not silently mean "capped at 0".
  SELECT value INTO v_launch_node FROM public.app_config WHERE key = 'node0_launch_node';
  IF v_node IS DISTINCT FROM COALESCE(v_launch_node, 'BBS Mall') THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO v_status FROM public.elite_trial_cap_status();
  RETURN v_status.remaining > 0;
END;
$$;

COMMENT ON FUNCTION public.elite_trial_slot_available IS
  'TRUE when this merchant may be granted an Elite trial: already has a granted-at stamp (re-grant, no new slot), or is a demo row, or is off the launch node, or the launch node still has slots left. Read by activate_merchant before offering the trial and by enforce_elite_trial_cap as the gate.';

-- ---------------------------------------------------------------------------
-- 5) The gate. Stamps the slot on the way through; raises when the offer is out.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_elite_trial_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only a transition INTO an active trial consumes a slot. Ending, converting or
  -- otherwise updating a merchant must pass straight through.
  IF NOT (COALESCE(OLD.elite_trial_active, FALSE) = FALSE AND NEW.elite_trial_active = TRUE) THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent grants so two admins approving at once cannot both read
  -- "99 granted" and push the total to 101. Same-transaction re-entrant, so the
  -- caller may hold this lock already.
  PERFORM pg_advisory_xact_lock(hashtext('elite_trial_cap'));

  IF NOT public.elite_trial_slot_available(NEW.id) THEN
    RAISE EXCEPTION 'ELITE_TRIAL_CAP_REACHED'
      USING ERRCODE = 'P0001',
            DETAIL  = 'The launch offer (30-day Elite trial) is capped at app_config.elite_trial_merchant_cap merchants at the launch node, and every slot has been used.',
            HINT    = 'elite_trial_cap_reached';
  END IF;

  -- Stamp on first grant only, so a later re-grant does not move the date and
  -- the record of when the slot was consumed stays true.
  IF NEW.elite_trial_granted_at IS NULL THEN
    NEW.elite_trial_granted_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_elite_trial_cap IS
  'Enforces the frozen launch offer cap ("first 100 BBS Mall merchants get a 30-day Elite trial") on EVERY path that switches elite_trial_active FALSE→TRUE, including direct UPDATEs from /api/admin/plans/[id] which bypass activate_merchant. Stamps merchants.elite_trial_granted_at (durable, never cleared) and raises ELITE_TRIAL_CAP_REACHED when the offer is exhausted. activate_merchant checks elite_trial_slot_available first and skips the trial rather than tripping this, so a full offer never blocks a merchant going live. Trigger-only — EXECUTE revoked.';

DROP TRIGGER IF EXISTS trg_enforce_elite_trial_cap ON public.merchants;
CREATE TRIGGER trg_enforce_elite_trial_cap
  BEFORE UPDATE ON public.merchants
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_elite_trial_cap();

-- ---------------------------------------------------------------------------
-- 6) activate_merchant — offer the trial only when a slot is actually available.
--    Body is otherwise identical to 20260720120000_security_hardening.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_merchant(
  p_merchant_id uuid,
  p_admin_user_id uuid,
  p_grant_elite_trial boolean DEFAULT false
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_status TEXT;
  v_merchant_node   TEXT;
  v_agent_id        UUID;
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_credit_amount NUMERIC;
  v_credit_cap    INT;
  v_launch_end    TIMESTAMPTZ;
  v_launch_node   TEXT;
  v_credited_count INT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'unauthorized: admin only';
    END IF;

    IF v_caller_id IS DISTINCT FROM p_admin_user_id THEN
      RAISE EXCEPTION 'unauthorized: p_admin_user_id does not match caller identity';
    END IF;
  END IF;

  SELECT status, node INTO v_merchant_status, v_merchant_node
    FROM public.merchants WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  IF v_merchant_status = 'active' THEN
    RAISE EXCEPTION 'already_active';
  END IF;

  SELECT id INTO v_agent_id FROM public.agents WHERE user_id = p_admin_user_id LIMIT 1;

  UPDATE public.merchants
  SET
    status       = 'active',
    onboarded_by = v_agent_id,
    onboarded_at = NOW(),
    updated_at   = NOW()
  WHERE id = p_merchant_id;

  -- Launch offer: capped at app_config.elite_trial_merchant_cap merchants at the
  -- launch node. Take the cap lock BEFORE checking so this check-then-grant is
  -- atomic against a concurrent activation; trg_enforce_elite_trial_cap takes the
  -- same (re-entrant) lock and stamps elite_trial_granted_at.
  --
  -- When the offer is exhausted the merchant is activated on Standard and NO
  -- trial is granted. Deliberately not an error: a promo running out must not
  -- stop a merchant going live. The admin UI reads elite_trial_cap_status() to
  -- know this will happen before ticking the box.
  IF p_grant_elite_trial THEN
    PERFORM pg_advisory_xact_lock(hashtext('elite_trial_cap'));

    IF public.elite_trial_slot_available(p_merchant_id) THEN
      UPDATE public.merchants
      SET
        tier               = 'elite',
        elite_trial_active = TRUE,
        trial_ends_at      = NOW() + INTERVAL '30 days',
        updated_at         = NOW()
      WHERE id = p_merchant_id;
    ELSE
      RAISE NOTICE 'activate_merchant: Elite trial not granted to % — launch offer cap reached', p_merchant_id;
    END IF;
  END IF;

  SELECT value::NUMERIC     INTO v_credit_amount FROM public.app_config WHERE key = 'node0_opening_credit_kes';
  SELECT value::INT         INTO v_credit_cap    FROM public.app_config WHERE key = 'node0_opening_credit_merchant_cap';
  SELECT value::TIMESTAMPTZ INTO v_launch_end    FROM public.app_config WHERE key = 'node0_launch_period_ends_at';
  SELECT value              INTO v_launch_node   FROM public.app_config WHERE key = 'node0_launch_node';
  v_launch_node := COALESCE(v_launch_node, 'BBS Mall');
  v_credit_cap := COALESCE(v_credit_cap, 100);

  IF COALESCE(v_credit_amount, 0) > 0
     AND v_merchant_status = 'pending'
     AND v_merchant_node = v_launch_node
     AND (v_launch_end IS NULL OR NOW() < v_launch_end)
     AND v_credit_cap > 0
  THEN
    PERFORM pg_advisory_xact_lock(hashtext('node0_opening_credit'));

    SELECT COUNT(*) INTO v_credited_count
      FROM public.merchant_transactions
      WHERE transaction_type = 'topup'
        AND payment_provider = 'manual'
        AND provider_reference LIKE 'node0_opening_credit:%';

    IF v_credited_count < v_credit_cap THEN
      UPDATE public.merchants
        SET account_balance = account_balance + v_credit_amount,
            updated_at      = NOW()
        WHERE id = p_merchant_id;

      INSERT INTO public.merchant_transactions (
        merchant_id, amount, transaction_type, payment_provider,
        provider_reference, description, currency, charged_amount
      )
      VALUES (
        p_merchant_id, v_credit_amount, 'topup', 'manual',
        'node0_opening_credit:' || p_merchant_id,
        'Node 0 launch opening credit · node0_opening_credit',
        'KES', 0
      );
    END IF;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.activate_merchant IS
  'Admin merchant activation. Grants the 30-day Elite trial only when p_grant_elite_trial AND elite_trial_slot_available() — the frozen launch offer is capped at the first 100 launch-node merchants (2026-07-30, decision D2). When the offer is exhausted the merchant is still activated, on Standard, with no trial: activation must not fail because a promo ran out. Also writes the Node 0 opening credit inline (2026-07-16).';

-- ---------------------------------------------------------------------------
-- 7) Least privilege. The trigger function has no legitimate direct caller;
--    the status/availability helpers are read by server-side code only.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.enforce_elite_trial_cap() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.elite_trial_cap_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.elite_trial_cap_status() TO service_role;

REVOKE ALL ON FUNCTION public.elite_trial_slot_available(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.elite_trial_slot_available(uuid) TO service_role;
