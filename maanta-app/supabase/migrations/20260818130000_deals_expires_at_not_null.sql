-- D29: enforce the every-deal invariant — deals.expires_at is NOT NULL.
--
-- ## The defect
--
-- `public.deals.expires_at` was nullable while `public.redemptions.expires_at`
-- is `NOT NULL`, and `claim_deal` tolerates a NULL deal expiry in its checks
-- (`IF v_deal.expires_at IS NOT NULL AND … <= NOW()`) but then inserts
-- `v_deal.expires_at + INTERVAL '15 minutes'` into the redemption. A claim on a
-- no-expiry deal therefore dies on a raw NOT NULL constraint violation — an
-- unhandled 500 on the money path — instead of a clean domain error, and the
-- ticket window would have been NULL. (D29, found by CodeRabbit on #137.)
--
-- ## Why NOT NULL is the right resolution, and not a product change
--
-- MAANTA has no concept of a never-expiring deal. Every deal gets its expiry from
-- the `set_deal_expiry` BEFORE INSERT trigger — standard = `starts_at + 24h`,
-- flash = `starts_at + flash_duration_hours`. That output is guaranteed non-null,
-- and all three facts were read back on production 2026-08-18:
--   * `starts_at` is `NOT NULL DEFAULT now()` (0 nulls in 1778 rows),
--   * `deal_type` is `CHECK (deal_type IN ('standard','flash'))` (0 other types),
--     so the trigger's IF/ELSIF covers every valid deal,
--   * the trigger fires `BEFORE INSERT`, so it runs before this constraint checks.
-- 0 of 1778 production deals have a NULL expiry, so no backfill is needed. This
-- migration codifies an invariant that already holds and makes the claim_deal 500
-- unreachable at the source — a null-expiry deal can no longer exist.
--
-- The trigger is INSERT-only by design; no path sets `expires_at` back to NULL on
-- UPDATE (the deal-edit route touches only title/description/max_claims/
-- is_paused/is_active, and the demo reseed writes concrete timestamps), so the
-- constraint is safe on the update side too — and correctly rejects any future
-- attempt to null an expiry.
--
-- Guard: supabase/tests/deals_expires_at_not_null_test.sql.

ALTER TABLE public.deals ALTER COLUMN expires_at SET NOT NULL;

COMMENT ON COLUMN public.deals.expires_at IS
  'When the deal stops being claimable. NOT NULL: every deal has an expiry, set by '
  'the set_deal_expiry BEFORE INSERT trigger (standard 24h / flash N h). claim_deal '
  'derives the redemption window from it (expires_at + 15m grace), so a NULL here '
  'would 500 a claim — the constraint keeps that state unreachable (D29).';
