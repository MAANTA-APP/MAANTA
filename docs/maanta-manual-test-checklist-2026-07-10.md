# MAANTA — manual verification checklist (post-audit engineering pass, 2026-07-10)

Run top to bottom after deploying branch `claude/maanta-audit-engineering-sy50cl`
(or after it merges to main). Each item says what to do and what "pass" looks
like. Env var names only — never paste values.

## 1. Function privileges (security fix)

Run `maanta-app/supabase/checks/verify-function-grants.sql` in the Supabase SQL
editor (or `psql`).

- **Pass:** zero rows. Every returned row is a SECURITY DEFINER function that
  anon/PUBLIC can execute and is a finding.
- Already verified 2026-07-10 after applying migration
  `lock_down_boost_and_role_escalation_grants` live: zero rows.
- Optional negative test: as a signed-out client (anon key),
  `POST {SUPABASE_URL}/rest/v1/rpc/purchase_boost` → must be **401/403/404
  permission error**, not a function-level error like `merchant_not_found`.

## 2. Waitlist — one submission per segment

Prereqs: `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`, `RESEND_FROM_EMAIL` set in the
deploy target (Vercel). Preview env is fine.

For each of **shopper**, **merchant** (`/waitlist?segment=merchant`), and
**mall operator** (`/waitlist?segment=mall_operator`):

1. Submit the form with a real inbox you control and a Kenyan-format phone
   (e.g. `0712 345 678`).
2. **Pass:** success state in UI; contact appears in the Resend Waitlist
   audience with `segment_type` = the right segment, `phone` normalized to
   `+254…`, `consent_at`/`consent_text` set.
3. Confirmation email arrives with the segment's subject
   (shopper: "You're on the MAANTA waitlist"; merchant: "…merchant launch
   list" — check it states the KES 30 fee; mall operator: "…thanks for your
   interest").
4. Re-submit the same email → still a friendly success (`alreadyJoined`),
   no duplicate contact.
5. Validation: bad email, missing consent, missing segment each → inline
   error, nothing lands in Resend.

## 3. No DB waitlist persistence

In Supabase SQL editor:
`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%waitlist%';`

- **Pass:** zero rows (verified 2026-07-10). Also confirm no new rows appear
  anywhere after the step-2 signups — the API is a stateless proxy.

## 4. Verify-anyway / disputes path

Needs a merchant account with wallet balance and a shopper account.

1. Shopper claims a deal **away from the shop** (or with location denied) so
   the claim records a geofence flag.
2. Merchant enters the code at `/merchant/redeem` → **pass:** the ⚠️ location
   mismatch screen appears (not silent success).
3. Tap **"Verify anyway — KES 30 fee"** → **pass:** Verified screen, fee
   debited (balance drops by 30).
4. In Supabase: the redemption row has `review_required = true` and
   `fraud_flags` contains `merchant_override`; a `fraud_events` row exists
   with `merchant_override: true` and the override reason (with distance);
   a high-priority `dispute_review` row exists in `agent_tasks`.
5. Admin opens `/admin/support` → **pass:** the dispute appears in Open
   issues; Override completes it and appends the audit line; it moves to
   Resolved.
6. Control: claim + verify at the shop with no flags → normal success, no
   dispute artifacts.

## 5. Preview / prod readiness

- CI green on the branch (lint, typecheck, 29 vitest tests, build — all
  passed locally 2026-07-10).
- Vercel preview deploy renders `/waitlist`, `/merchant/redeem`,
  `/admin/support`.
- Env vars present in the deploy target: the three `RESEND_*` vars (new),
  plus existing Supabase/Stripe ones. Stripe stays sandbox (frozen rule).

## Known non-blockers noted during the audit pass

- Sequence-doc email #1 subjects differ from shipped confirmation copy, and
  docs say "tag" where the implementation uses the `segment_type` property —
  see `docs/maanta-resend-email-templates.md`.
- Sequence broadcasts (#2+) are not staged in Resend yet; blocked on
  founder-dependent copy facts (launch date, merchant count, incentive).
