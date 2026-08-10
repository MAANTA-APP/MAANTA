-- SEC-001 / drift D83: reconcile the credited amount against the amount the
-- merchant actually initiated.
--
-- The IntaSend webhook takes its amount straight from the payload
-- (`Number(payload.value ?? payload.amount ?? 0)`), bounded only by
-- 0 < amount <= MAX_TOPUP_AMOUNT. Nothing has ever cross-checked it against the
-- STK push that started the payment, because nothing recorded that the push
-- happened: `POST /api/topup` minted an `api_ref`, called the provider, and
-- persisted nothing. So a webhook that authenticates (today, by echoing a static
-- shared secret) can name any amount up to KES 1,000,000 and be believed.
--
-- This table is the missing record. One row per initiated STK push, keyed by
-- the same `api_ref` the webhook already parses the merchant id out of, so the
-- webhook can look up what was actually asked for and refuse anything else.
--
-- Deliberately NOT a fix for the authentication half of D83. A caller holding
-- the shared secret can still forge a webhook — but now only for an amount that
-- a real merchant really initiated, which turns "mint KES 1,000,000 at will"
-- into "replay a specific pending top-up", and the ledger's UNIQUE constraint
-- on provider_reference already makes that a no-op. The signature question is
-- still open and still needs IntaSend's answer.
--
-- Money-path note: this table is a GUARD, never the source of truth for a
-- balance. `merchant_transactions` remains the ledger, and
-- `record_merchant_ledger_entry` remains the only thing that moves a balance.
-- Nothing here can credit anyone.

CREATE TABLE public.pending_topups (
  -- The app-minted `topup:<merchant-uuid>:<uuid>` handed to the provider. Also
  -- the ledger's provider_reference for this payment, so the two records join
  -- on exactly the value the webhook carries — no second correlation key to
  -- drift.
  api_ref          TEXT PRIMARY KEY,
  merchant_id      UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  -- What the merchant asked to top up, in `currency`. The webhook must match
  -- this or it is refused.
  amount           NUMERIC NOT NULL CHECK (amount > 0),
  currency         TEXT NOT NULL DEFAULT 'KES',
  payment_provider TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'initiated'
                   CHECK (status IN ('initiated', 'completed', 'abandoned')),
  -- Provider-side id, recorded when the STK push returns it. Diagnostic only —
  -- idempotency keys on api_ref, never on this (the reason D83's replay half
  -- existed).
  invoice_id       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- Ops: "what is outstanding for this merchant", newest first.
CREATE INDEX idx_pending_topups_merchant
  ON public.pending_topups(merchant_id, created_at DESC);
-- Ops: sweep stale 'initiated' rows (a push the shopper never completed).
CREATE INDEX idx_pending_topups_status
  ON public.pending_topups(status, created_at DESC);

ALTER TABLE public.pending_topups ENABLE ROW LEVEL SECURITY;

-- Read-only for humans. Writes are service_role only, because the only writer
-- is the top-up route and the only updater is the webhook — both server-side.
CREATE POLICY pending_topups_admin_read ON public.pending_topups
  FOR SELECT USING (public.current_user_role() = 'admin');

-- A merchant may see their own outstanding top-ups. Scoped through
-- merchants.user_id rather than trusting any client-supplied merchant id.
CREATE POLICY pending_topups_merchant_read ON public.pending_topups
  FOR SELECT USING (
    merchant_id IN (
      SELECT id FROM public.merchants WHERE user_id = public.current_user_id()
    )
  );

REVOKE ALL ON TABLE public.pending_topups FROM PUBLIC;
REVOKE ALL ON TABLE public.pending_topups FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.pending_topups FROM authenticated;
GRANT SELECT ON TABLE public.pending_topups TO authenticated;
GRANT ALL ON TABLE public.pending_topups TO service_role;

COMMENT ON TABLE public.pending_topups IS
  'One row per initiated M-Pesa STK push, keyed by the app-minted api_ref. Exists so the IntaSend webhook can reconcile the credited amount against what the merchant actually initiated (SEC-001 / D83). A guard, not a ledger: nothing here moves a balance.';
