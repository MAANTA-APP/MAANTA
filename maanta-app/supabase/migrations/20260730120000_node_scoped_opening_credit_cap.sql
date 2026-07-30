-- ============================================================
-- Opening-credit cap is counted PER NODE, not globally
--
-- `activate_merchant` gates the launch opening credit on four app_config
-- values, one of which is a first-N merchant cap
-- (`node0_opening_credit_merchant_cap`). The cap COUNT, however, was global:
--
--   SELECT COUNT(*) FROM merchant_transactions
--    WHERE transaction_type = 'topup' AND payment_provider = 'manual'
--      AND provider_reference LIKE 'node0_opening_credit:%';
--
-- Every opening credit ever granted, at any node, counted against the cap of
-- whichever node is currently the launch node. That is correct while exactly one
-- node has ever run the promo — Node 0 / BBS Mall today — and wrong the moment a
-- second one does. Concretely: once Node 0's 100 merchants are credited and ops
-- points `node0_launch_node` at the next mall, the count is already at the cap,
-- so **the new node's promo is dead on arrival** — every activation there
-- silently grants nothing while `/for-merchants` advertises the credit. The
-- failure is silent on both sides: no error is raised, and the merchant is simply
-- activated with a zero balance.
--
-- Reproduced before this migration (cap forced to 1, one credit granted at the
-- launch node, launch node then moved): the new node's merchant was activated
-- with balance 0.00 instead of the credit.
--
-- Fix: scope the count to the launch node by joining `merchants`, so each node
-- gets its own first-N allowance. The advisory lock is scoped the same way, so
-- concurrent activations at different nodes no longer serialise against each
-- other while still serialising within a node (which is what makes the cap
-- atomic).
--
-- NOT changed: the frozen KES 300 amount and 100-merchant cap, the four gate
-- conditions, the pending-only guard, the ledger row's shape, and the
-- idempotency anchor `provider_reference = 'node0_opening_credit:<merchant_id>'`
-- (which stays merchant-keyed and therefore stays UNIQUE — changing its format
-- would let an already-credited merchant be credited a second time under a new
-- reference).
--
-- KNOWN LIMIT, deliberately not solved here: the count attributes each credit to
-- the merchant's CURRENT node, because the ledger row has nowhere to snapshot the
-- node at grant time. Nothing in the app mutates `merchants.node` — it is set
-- once by onboarding, and `authenticated` writes to core tables are revoked — so
-- the two are identical today. If node changes ever become a real operation, the
-- count must move to a snapshot taken at grant time rather than a live join.
--
-- Still a single-node-at-a-time promo: `node0_launch_node` is one value, so only
-- one node qualifies at any moment. This migration makes SEQUENTIAL nodes work
-- (Node 0, then Node 1); running two nodes' promos simultaneously would need a
-- per-node config shape, which is a product decision, not a bug fix.
-- ============================================================

-- Recreate activate_merchant. Byte-for-byte the prior definition
-- (20260720120000_security_hardening.sql §10) except for the advisory-lock key
-- and the cap-count query.
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

  IF p_grant_elite_trial THEN
    UPDATE public.merchants
    SET
      tier               = 'elite',
      elite_trial_active = TRUE,
      trial_ends_at      = NOW() + INTERVAL '30 days',
      updated_at         = NOW()
    WHERE id = p_merchant_id;
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
    -- Per-node lock: the cap is per-node, so serialise per-node. Two nodes
    -- counting concurrently is correct — they count disjoint sets.
    PERFORM pg_advisory_xact_lock(hashtext('node0_opening_credit:' || v_launch_node));

    -- Per-node count. Joining merchants is what scopes it; without the join a
    -- filled node permanently exhausts every later node's allowance.
    SELECT COUNT(*) INTO v_credited_count
      FROM public.merchant_transactions mt
      JOIN public.merchants m ON m.id = mt.merchant_id
      WHERE mt.transaction_type = 'topup'
        AND mt.payment_provider = 'manual'
        AND mt.provider_reference LIKE 'node0_opening_credit:%'
        AND m.node = v_launch_node;

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

-- Note the cap key's meaning for whoever reads app_config next.
UPDATE public.app_config
SET notes = 'Max number of merchants PER NODE that may receive the launch opening credit (first-N promo, counted against merchants at node0_launch_node only — see migration 20260730120000). Frozen at 100 — see decisions log.'
WHERE key = 'node0_opening_credit_merchant_cap';
