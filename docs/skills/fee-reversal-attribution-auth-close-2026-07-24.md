# Fee-reversal note · agent attribution · launch auth — closeout (2026-07-24)

Builder session against `claude/fee-reversal-agent-attribution-3ks0pe`. The three
requested code tasks were **already substantially shipped on this branch** (it
sits ~200 commits ahead of `main`, which is still at #17). This session closed
the one real gap, added the one missing flag, verified the rest, and records the
PR-state reality below because it contradicts the task framing.

## What this session changed (the only real gaps)

1. **Task 1(d) — fee-reversal note is now NOT NULL at the column.**
   `supabase/migrations/20260724130000_fee_reversals_note_not_null.sql`:
   backfills any legacy null/blank note, `ALTER COLUMN note SET NOT NULL`, and
   adds `CHECK (char_length(btrim(note, E' \t\n\r\f\v')) BETWEEN 1 AND 2000)`
   (`fee_reversals_note_not_blank`). This is the 4th enforcement layer the
   2026-07-23 ruling calls for — layers a/b/c (modal disable, route 400, RPC
   `note_required`) already shipped in migration `20260723150000` and the admin
   route. Test scenario 7 added to `supabase/tests/fee_reversal_test.sql` proves
   a DIRECT insert (bypassing the RPC) rejects null (`not_null_violation`) and
   whitespace-only (`check_violation`) notes and accepts a valid one. Constraint
   logic validated against a real Postgres 16.

2. **Task 3 — launch auth mix behind a flag with both enabled.**
   `src/lib/launch-auth.ts` (+ `__tests__/launch-auth.test.ts`): `phone_only`
   and `email_and_phone` both enabled, default `email_and_phone` (S2 ruling
   2026-07-23), env-overridable via `NEXT_PUBLIC_LAUNCH_AUTH_MODE`, fail-safe to
   default. `PHONE_REQUIRED_AT_CLAIM` is a frozen `true` wired into the claim
   gate in `src/app/api/redemptions/route.ts` so the gate reads as policy and is
   never relaxed by the mix. No founder decision is baked in.

## What was already shipped (verified, unchanged)

- **Task 1 a/b/c** — modal `disabled={!note.trim()}` with disabled styling
  `cream-dark`=`#F1F1F1` on `faint`=`#6B6B6B` (never amber); route rejects
  empty/whitespace with 400 and maps RPC `note_required`→400; RPC trims all
  whitespace and raises `note_required`. Amount = stored fee snapshot, arrears
  settle first, one reversal per redemption, admin-approver check — all intact.
- **Task 2 — agent-assisted onboarding attribution (G1).** `onboard_merchant`
  (migration `20260702085628`) stores `onboarding_mode` enum + `assisted_by_agent_id`,
  validates the agent (active/exists) else `invalid_attribution` with zero rows,
  merchant is always the authenticated caller, role promotion via the trusted
  service path with the self-escalation guard. Route
  `src/app/api/merchants/onboard/route.ts` forwards attribution and maps
  `invalid_attribution`→400. `src/lib/agent-attribution.ts` **does not exist**
  (already deleted, no imports). Tests: route (5) + `onboard_agent_attribution_test.sql`.
- **Task 3 auth** — Clerk owns auth; email + phone OTP both offered; claim gate
  returns `403 {code:"phone_required"}` and `claim-flow.tsx` routes email-only
  sessions to `/verify-phone?next=/deals/[id]` and back. Browsing needs no phone
  or payment.
- **Redeem UI (the "#20/#21 rewrite")** — the current `redeem-keypad.tsx` +
  `FeeDisclosure` are ALREADY the shipped one-confirm behaviour: flat KES 30
  disclosed before the tap, single explicit Confirm, Confirm **never** gated by
  balance, underfunded → arrears and the redemption still completes. No "Confirm
  disabled when fee > balance" / "Redemption paused until cleared" remains;
  `fee-disclosure.test.ts` guards against their return. Only new-deal creation
  gates at zero balance (`wallet/page.tsx`).

## PR reality (contradicts the task framing — surfaced, not acted on)

The task described PRs #18–#23 as blocked/open and asked to rewrite #20/#21 and
merge #18–#23. **They are all already closed:**

- #19, #20, #21, #23 — **merged** into this branch's history.
- #18 (merchant_staff billing gate) — **closed unmerged** (`mergeable_state: dirty`).
- #22 — closed.
- Actually-open PRs today: **#35** (Playwright e2e, red until a live env), **#56**
  (PostHog), **#65/#67** (Cursor dev-env drafts). None are #18–#23.

There is no #20/#21 to "unblock" and no closed PR can be re-merged, so the
substance — the shipped redeem behaviour — was verified in the current tree
instead. Merging #18–#23 was not possible or needed; not done.

## Golden-path E2E — status

Traced end to end in code (browse anon → `/login` at claim → claim RPC after
phone gate → ticket code → merchant preflight→FeeDisclosure→verify →
`RedemptionResult` green takeover with `newBalance`/`feeAmount` → `success_fee`
ledger row linked to the redemption → ticket shows `ClaimChip state="redeemed"`
= "REDEEMED" + server `redeemed_at` + same code). **Could not RUN it here:** the
browser suite (PR #35) needs live Clerk + seeded TEST Supabase; the RPC-layer
`golden_path_test.sql` needs the Supabase CLI (absent — only `psql`/`docker`).
CI's `db-tests` job runs the SQL golden path (PR #67: 14/14 green on this branch).

## Verification run this session

`npm run typecheck` clean · `npm run lint` clean · `npm test` **188 pass**
(183 + 5 new launch-auth) · `npm run build` exit 0 with placeholder Clerk keys
(all 81 routes) · new NOT NULL+CHECK logic validated on Postgres 16.

## Grep-reject (forbidden copy) — clean

- No **dispute** promise says "24 hour" — dispute/support SLA is "within 72
  hours" (`tickets/[id]/page.tsx`). The remaining "24 hours" strings are
  merchant-approval SLA and deal-duration, not disputes.
- No **fee-waiver** language for the KES 300. "Free" appears only for the
  Standard plan subscription (with "KES 30 success fee per verified redemption ·
  pay only when a redemption is verified" stated) and the Elite trial — neither
  waives the success fee or describes the KES 300 credit.

## SPEC-GAPs left

- `// SPEC-GAP:` (in `src/lib/launch-auth.ts`) — the actual enablement of Clerk
  sign-up factors lives in the Clerk **dashboard**, not app code; the flag records
  the decision surface + default and is the single app-side branch point. Keeping
  the two in sync is a deploy-config step.
- **"DP-… ledger row"** (Task 1 test wording) — the codebase has no `DP-` ledger
  reference convention. The reversal credit is a `fee_reversal`
  `merchant_transactions` row (`reference_id` = redemption id) with a
  human-readable description; scenario 1 already asserts it. Treated as the
  intended "credit ledger row"; no `DP-` prefix invented.
