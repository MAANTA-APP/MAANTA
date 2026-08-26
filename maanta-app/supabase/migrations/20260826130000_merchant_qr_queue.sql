-- Merchant counter QR + shopper presentation queue (founder-authorized
-- engineering window, 2026-08-26, package 3 of 3).
--
-- ## The product rule
--
-- The QR is an ALTERNATIVE PRESENTATION METHOD, never a replacement for the
-- 6-digit code: the shopper scans the MERCHANT's printed counter QR to check
-- in, staff still verify through the exact same `verify_redemption` path,
-- and manual code entry keeps working everywhere it works today. One QR
-- identity per merchant — the same token printed at the entrance and the
-- till; the shopper's state decides what happens, not which sticker they
-- scanned.
--
-- ## Token design (threat model)
--
-- `merchants.qr_token` is an OPAQUE identifier: 32 hex chars from pgcrypto's
-- CSPRNG (128 bits — enumeration is hopeless). It identifies the merchant
-- and AUTHORIZES NOTHING: resolving it costs an attacker exactly what the
-- printed sticker already discloses (the shop exists), and every action
-- behind it re-authorizes independently — arrival via record_shopper_arrival
-- (caller must own the claim, merchant must match), redemption via
-- verify_redemption (staff seat + can_verify, untouched here). A
-- photographed or copied QR therefore lets a shopper check in remotely at
-- worst, which staff verification renders harmless: no arrival ever moves
-- money, and no points move without a verified redemption. Deliberately no
-- extra anti-fraud beyond that before field evidence.
--
-- The token is NOT exposed to clients: D147 revoked base-table merchant
-- reads from anon/authenticated, and the public browse views enumerate their
-- columns explicitly (asserted in supabase/tests/merchant_qr_queue_test.sql).
-- Resolution happens server-side only.
--
-- ## The queue
--
-- `merchant_presentations` is an EPHEMERAL check-in list, not a state
-- machine on redemptions: the redemption's own status stays canonical
-- (`pending/success/failed/flagged`, deliberately unchanged), and a queue
-- row only says "this shopper is standing in the shop right now". Entries
-- time out (~10 minutes, filtered by expires_at, no cron), the shopper can
-- cancel, staff can dismiss without touching the claim, and a redeemed
-- ticket drops out because the staff list joins the live redemption. At most
-- one WAITING row per redemption (partial unique index) — a re-scan renews
-- the existing entry instead of duplicating it.
--
-- Reads/writes: shoppers SELECT their own rows via RLS; the staff queue view
-- goes through the merchant API route (service client scoped by merchant_id,
-- the same posture as the redemption preflight); no client-side writes at
-- all.
--
-- Guard: supabase/tests/merchant_qr_queue_test.sql

-- 1) The merchant's counter token. Volatile DEFAULT: every existing row gets
--    its own fresh token at ALTER time, every future merchant mints one on
--    insert. NOT NULL + UNIQUE from birth.
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS qr_token TEXT NOT NULL
    DEFAULT encode(extensions.gen_random_bytes(16), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS merchants_qr_token_key
  ON public.merchants (qr_token);

COMMENT ON COLUMN public.merchants.qr_token IS
  'Opaque counter-QR identifier (32 hex chars, CSPRNG). Identifies the '
  'merchant for shopper check-in; authorizes NOTHING — arrival and '
  'verification each re-authorize independently. Never exposed to clients '
  '(base-table reads revoked D147; browse views enumerate columns). One per '
  'merchant, same token at entrance and till. 2026-08-26.';

-- 2) The ephemeral queue.
CREATE TABLE IF NOT EXISTS public.merchant_presentations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  redemption_id       UUID NOT NULL REFERENCES public.redemptions(id) ON DELETE CASCADE,
  shopper_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  arrived_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fast_visit_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'waiting'
                      CHECK (status IN ('waiting', 'cancelled', 'dismissed')),
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.merchant_presentations IS
  'Ephemeral shopper check-in queue per merchant. NOT redemption state — the '
  'redemption''s own status stays canonical and untouched. Entries expire by '
  'expires_at (no cron), shoppers cancel their own, staff dismiss without '
  'affecting the claim, and verified tickets drop out via the join to the '
  'live redemption. fast_visit_eligible is a display snapshot for the staff '
  'list of the persisted arrival-time verdict '
  '(redemptions.fast_visit_qualified_at, immutable — D191); the award '
  'requires that same persisted fact. 2026-08-26.';

-- One live check-in per claim; cancelled/dismissed rows free the slot so a
-- fresh check-in (still-valid claim, expired entry) can be taken.
CREATE UNIQUE INDEX IF NOT EXISTS merchant_presentations_waiting_key
  ON public.merchant_presentations (redemption_id)
  WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_presentations_merchant_waiting
  ON public.merchant_presentations (merchant_id, status, expires_at);

ALTER TABLE public.merchant_presentations ENABLE ROW LEVEL SECURITY;

-- Shoppers see their own check-ins; admins see all. Merchant staff read
-- through the API route (service client + merchant_id scoping — the same
-- pattern as the redemption preflight), NOT through RLS, because the
-- baseline redemptions_merchant policy shape only covers owners and a staff
-- seat is not the merchant's user_id.
CREATE POLICY presentations_own ON public.merchant_presentations
  FOR SELECT USING (shopper_id = public.current_user_id());
CREATE POLICY presentations_admin ON public.merchant_presentations
  FOR SELECT USING (public.current_user_role() = 'admin');

REVOKE ALL ON TABLE public.merchant_presentations FROM PUBLIC;
REVOKE ALL ON TABLE public.merchant_presentations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.merchant_presentations FROM authenticated;
GRANT SELECT ON TABLE public.merchant_presentations TO authenticated;
GRANT ALL ON TABLE public.merchant_presentations TO service_role;
