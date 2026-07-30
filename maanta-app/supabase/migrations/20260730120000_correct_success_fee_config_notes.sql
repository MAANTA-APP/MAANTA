-- Truth audit 2026-07-30: correct the stale metadata on app_config.success_fee_kes.
--
-- METADATA ONLY. This migration changes no value, no function, no policy and no
-- behaviour — only the human-readable `notes` string on one config row, plus the
-- matching COMMENT on the guardrail function that seeded it. The fee itself
-- stays 30.00 and is deliberately re-asserted rather than assumed, so applying
-- this against a drifted database is still safe.
--
-- Two errors in the text seeded by 20260702094145_harden_success_fee_amount.sql:
--
--   1. "the Elite subscription, which is under Oct 2026 review" — superseded by
--      the founder ruling of 2026-07-20, which moved the Elite price review to
--      Feb 2027. Every other artifact (CLAUDE.md, docs/maanta-decisions-log.md,
--      docs/maanta-project-overview.md, the Notion "Frozen Scope & Rules" page)
--      already says Feb 2027; the live database was the last place still saying
--      Oct 2026, and it is the place an operator reads when checking the fee.
--
--   2. "PROJECT_RULES.md / DECISIONS_LOG.md" — neither file exists in the repo.
--      The decisions log lives at docs/maanta-decisions-log.md and the frozen
--      rules at CLAUDE.md. A pointer to a non-existent file sends whoever is
--      verifying the fee looking for a document they cannot find.
--
-- Rollback: harmless to leave in place. To revert the text, re-run the original
-- INSERT ... ON CONFLICT block from 20260702094145_harden_success_fee_amount.sql.

INSERT INTO public.app_config (key, value, notes)
VALUES (
  'success_fee_kes',
  '30.00',
  'Frozen per-verified-redemption success fee, KES. Charged on ALL plans (Standard and Elite) at point of merchant verification. See CLAUDE.md "Frozen business rules" and docs/maanta-decisions-log.md. No price-review caveat (unlike the Elite subscription, which is under Feb 2027 review per the founder ruling of 2026-07-20) — change only on an explicit new docs/maanta-decisions-log.md entry.'
)
ON CONFLICT (key) DO UPDATE
  SET notes = EXCLUDED.notes;

COMMENT ON FUNCTION public.enforce_deal_success_fee() IS
  'Security hardening 2026-07-02: forces deals.success_fee to the canonical app_config.success_fee_kes value on every write, regardless of client input. Closes a merchant-side fee-tampering path (deals RLS policy is unrestricted ALL with no WITH CHECK). SECURITY DEFINER because app_config is admin-only under RLS. EXECUTE revoked from all roles including authenticated/service_role/postgres — trigger-only, no legitimate direct caller. Doc pointers corrected 2026-07-30: the frozen rules live in CLAUDE.md and docs/maanta-decisions-log.md (the previously referenced PROJECT_RULES.md / DECISIONS_LOG.md do not exist), and the Elite price review is Feb 2027, not Oct 2026.';
