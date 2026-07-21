# Skill / Handoff — MVP verification against the Frozen UI handoff (Pass 2)

**Session type:** Reviewer / Builder (verification pass)
**Date:** 2026-07-21
**Branch:** `claude/maanta-mvp-implementation-txxak5` (45 commits ahead of `main`, unmerged)
**Binding spec:** `design_handoff_maanta_mvp/` — `README.md` (WHAT) + `ENGINEERING_NOTES.md` (HOW).
Precedence: ENGINEERING_NOTES > README > existing code > `.dc.html` boards. The
handoff bundle is git-ignored (never ship the `.dc.html` / `support.js`).

## Why this session existed

The kickoff prompt reads like a greenfield build, but the branch already carries
a mature, near-complete MVP (merchant / shopper / admin / agent apps, 50
migrations incl. the `verify_code`/`verify_redemption` money path, 6 SQL test
suites, 40 JS tests, `/demo`). The spec folder referenced by the prompt was not
on disk; the founder supplied it mid-session as two zips. So the correct action
was **verify the existing implementation against the now-available frozen spec,
close any real gaps, and record the result** — not rebuild.

## Verification matrix (all green)

| Check | How run | Result |
|---|---|---|
| `npm run test` (vitest) | local | **40 / 40 pass** |
| `npm run typecheck` (`tsc --noEmit`) | local | **clean** |
| `npm run build` (next build) | local, with placeholder env | **clean, 0 errors, 91 routes** |
| `supabase/tests/*.sql` (6 suites) | local Postgres harness (see below) | **6 / 6 pass** |

### SQL money-path suites (ENGINEERING_NOTES §2/§3/§8.4) — all pass

- `verify_redemption_money_path_test` — idempotency/one-winner (a code redeems
  exactly once, no double `success_fee`); balance 20 → `owed` + arrears, balance
  untouched, redemption still succeeds; forced fee-step error → `unknown` (never
  silently `owed`) + `agent_tasks` fraud_review/high row.
- `topup_settles_arrears_test` — settle-arrears-first math, integer shillings.
- `success_fee_reference_link_test` — ledger row links to the redemption reference.
- `golden_path_test` — claim → verify → ledger E2E at the RPC layer.
- `node0_opening_credit_test`, `security_hardening_test`.

### How the SQL suites were run without Docker

CI runs these via `supabase start` (Docker), which isn't available in this
environment. Reproduced on a local Postgres 16 cluster (run as the `postgres`
system user under `/var/lib/postgresql/`) with:

1. A **Supabase-compat bootstrap** (`scratchpad/bootstrap.sql`): roles
   `anon` / `authenticated` / `service_role` / `authenticator`; `auth` schema
   with `auth.uid()` / `auth.jwt()` / `auth.role()` reading the
   `request.jwt.claims` GUC; a minimal `auth.users`; `storage` schema
   (`buckets` / `objects` / `foldername`); `extensions` schema.
2. A **transformed copy of the migrations** with postgis stubbed to `text`
   (`GEOGRAPHY(POINT,4326)` / `public.geography` / `extensions.geography` →
   `text`; `CREATE/DROP EXTENSION postgis` → no-op). postgis is used only for
   the unused `redemptions.consumer_gps` location column and two function
   params — the money path never touches it. Mapping **all** geography variants
   to bare `text` keeps every `claim_deal` signature identical, so
   `CREATE OR REPLACE` replaces rather than overloading (a partial substitution
   creates a spurious 2nd overload → "function is not unique" / stale
   `amount_kes` — a harness artifact, not a code bug).

The **real migrations were not modified.** All 50 apply cleanly to the harness;
exactly one `claim_deal` overload results, matching the real post-relocation DB.

## Frozen hard-rule audit (README §Hard Rules, ENGINEERING_NOTES §8)

Enforced in CI as static ratchets (`src/lib/__tests__/frozen-ui-rules.test.ts`):
money never amber (`text-brand` on a money value is forbidden); closed
vocabulary (no voucher/coupon/discount code/Free plan); error red is
borders/icons only (message text stays `#111`); merchant failure takeover is
`bg-ink-900`, never red. All pass.

Spot-checked by reading source (not covered by automated tests):

- **S5 claimed code** (`tickets/[id]/claimed-code.tsx`) — white card, `animate-r3`
  2.5px breathing amber border, 1s live `mm:ss` countdown anchored to a
  server `expires_at`, mono slashed-zero code, **zero amber actions**. ✔
- **M9 charge disclosure** (`merchant/(app)/deals/new/new-deal-wizard.tsx`) —
  `extrasChoice` starts `null` (neither option preselected); cannot advance to
  publish without answering; Publish button text carries the shopper's final
  number (`Publish — shoppers pay KES {previewPay}`); `you_pay` validated
  server-side. ✔
- **Foundation** — tokens mirrored in `tailwind.config.ts` as semantic names
  (`brand`/`ink`/`paper`/`rust`/`flame`/`verified`/`line`/…), values matching
  `tokens.css`; Inter + JetBrains Mono via Next font vars; R3 pulse keyframe. ✔

## Observations / gaps

- **SPEC-GAP comments added this session: none.** No code changes were required
  to reach green, so no new `// SPEC-GAP:` markers were introduced.
- **Deviation (documented, not "fixed"):** the create-deal flow is a **4-step**
  wizard (details → price → schedule → publish) rather than the README's literal
  "3 steps", and the charge-disclosure question sits on the price step rather
  than a dedicated step 3. No **frozen rule** is violated — disclosure is
  mandatory, unpreselected, publish-gated, and the button carries the final
  number. Restructuring reviewed, tested, CI-green code to match the board's
  step count was judged out of scope for a verification pass; flagged here for a
  future Builder session if pixel-parity with the M8/M9 board layout is wanted.
- **Env note:** `npm run build` fails only for a missing well-formed
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at prerender (Clerk wraps every page). CI
  supplies a dummy `pk_test_…` decoding to `placeholder.clerk.accounts.dev$`;
  do the same locally. Not a code defect.

## Route inventory (91 routes, from `next build`)

Public/landing: `/`, `/about`, `/contact`, `/faq`, `/for-merchants`,
`/for-shoppers`, `/how-it-works`, `/pricing`, `/privacy`, `/terms`,
`/merchants`, `/malls/bbs-mall`.
Shopper PWA: `/feed`, `/deals`, `/deals/[id]`, `/tickets/[id]`, `/my-deals`,
`/shops/[id]`, `/search`, `/profile`, `/notifications`,
`/notifications/preferences`, `/help`, `/select-mall`, `/onboarding`.
Merchant: `/merchant`, `/merchant/redeem` (keypad home), `/merchant/wallet`,
`/merchant/wallet/[id]`, `/merchant/topup`, `/merchant/deals`,
`/merchant/deals/new`, `/merchant/deals/[id]`, `/merchant/deals/archived`,
`/merchant/plan`, `/merchant/plan/upgrade`, `/merchant/plan/success-fee`,
`/merchant/staff`, `/merchant/staff/new`, `/merchant/staff/[id]`,
`/merchant/redemptions`, `/merchant/dashboard`, `/merchant/alerts`,
`/merchant/settings`, `/merchant/more`, `/merchant/support`, `/merchant/onboard`.
Admin (desktop): `/admin`, `/admin/merchants`, `/admin/merchants/[id]`,
`/admin/deals`, `/admin/redemptions`, `/admin/reports`, `/admin/agents`,
`/admin/billing`, `/admin/support`.
Agent: `/agent`, `/agent/leads`, `/agent/leads/new`.
Auth/demo: `/login/[[...rest]]`, `/sign-up/[[...rest]]`, `/demo`.
API: `/api/redemptions` (+ `/verify`, `/preflight`, `/reject`), `/api/deals`
(+ `/[id]`, `/repost`), `/api/boosts` (+ `/move`), `/api/wallet`, `/api/topup`
(+ `/stripe`), `/api/favourites`, `/api/leads`, `/api/staff` (+ `/[id]`),
`/api/archive/[id]`, `/api/merchants/onboard`, `/api/w3w/validate`,
`/api/push/subscribe`, `/api/webhooks/stripe`, `/api/webhooks/intasend`,
`/api/admin/*` (deals, fraud, merchants approve/ops, plans, support).

## Reproducing the SQL harness (next session)

Postgres binaries live at `/usr/lib/postgresql/16/bin`; run the cluster as the
`postgres` system user (`runuser -u postgres …`) with data dir under
`/var/lib/postgresql/` (the scratchpad path is not traversable by that user).
The bootstrap + transform steps are above; drop the whole thing and re-`initdb`
if state gets confused. Prefer real `supabase start` if Docker becomes available.
