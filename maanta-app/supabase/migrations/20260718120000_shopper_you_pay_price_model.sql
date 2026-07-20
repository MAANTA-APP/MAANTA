-- Shopper "YOU PAY" price model (maanta-design-brief §4 / §10).
--
-- YOU PAY is the single exact amount the shopper hands over:
--   YOU PAY = price_kes + SUM(disclosed extras)
-- Every extra (VAT, service, packaging, …) is mandatory and folded into that
-- one number. Extras are declared once, at deal creation (M9 charge
-- disclosure), and CANNOT be added at the counter — the merchant app has no
-- field for it. If a merchant forgets a charge, they end the deal and create a
-- new one; existing claims are honoured at the price disclosed when claimed.
--
-- DECISIONS_LOG (2026-07-18): this is the amount the SHOPPER pays the MERCHANT.
-- It is independent of, and does not touch, the frozen KES 30 MAANTA success
-- fee (deals.success_fee / redemptions.success_fee_charged), which is unchanged.
--
-- Columns are NULLable so pre-existing deals (which never carried a shopper
-- price) keep working and simply show no YOU PAY until re-published.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS price_kes      NUMERIC(10, 2) CHECK (price_kes >= 0),
  ADD COLUMN IF NOT EXISTS compare_at_kes NUMERIC(10, 2) CHECK (compare_at_kes >= 0),
  ADD COLUMN IF NOT EXISTS charges        JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.deals.price_kes IS
  'Base amount the shopper pays before disclosed extras, KES. NULL = no published price (legacy deals show no YOU PAY).';
COMMENT ON COLUMN public.deals.compare_at_kes IS
  'Optional struck "Was" reference price, KES. Displayed only when greater than the computed YOU PAY.';
COMMENT ON COLUMN public.deals.charges IS
  'Disclosed mandatory extras, folded into YOU PAY: array of {label, type:"fixed"|"percent", value}. Frozen at publish — no counter-side additions (brief §4/§10).';

-- charges must be a JSON array (element shape is validated in the API layer).
-- Guarded so the migration is safely re-runnable (ADD CONSTRAINT has no
-- IF NOT EXISTS in Postgres).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_charges_is_array'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_charges_is_array
      CHECK (jsonb_typeof(charges) = 'array');
  END IF;
END $$;

-- Snapshot of YOU PAY at claim time, so a claimed code is argued from the exact
-- amount that was disclosed when the shopper claimed it.
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS amount_kes NUMERIC(10, 2) CHECK (amount_kes >= 0);

COMMENT ON COLUMN public.redemptions.amount_kes IS
  'YOU PAY snapshot at claim, KES (price_kes + disclosed extras). NULL when the deal had no published price.';
