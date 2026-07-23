# Pre-rehearsal acceptance sweep — 2026-07-23

Reviewer session (verification, not development). Checklist source of truth: the
**PASS-2 SELF-REVIEW** strips at the bottom of each `design_handoff_maanta_mvp/*.dc.html`
board (Claude Design project `MAANTA Prototype`) + the handoff `README.md` "Hard Rules".

**Target:** local `npm run dev` against a from-scratch Supabase-compatible stack
(Postgres 16 + postgis + PostgREST 14, all 57 migrations applied) seeded with
`supabase/seed/node0_rehearsal_seed.sql`. Vercel preview + `*.vercel.app` +
`maanta.app` + the live Supabase/Clerk hosts are all outside this session's egress
allowlist, so the sweep ran locally. Clerk verified via locally-minted session JWTs
(networkless). Browser: mobile Chromium (Pixel 7, 390×844) for shopper/merchant,
desktop 1440×900 for admin/landing.

## Verdict

**Golden path passes end-to-end.** The money invariants hold: claim → two-step
verify → single ledger row per reference → wallet reconciles → shopper sees REDEEMED;
wrong code charges nothing; a low/empty wallet never blocks verification (fee →
arrears); new-deal creation is hard-blocked at zero balance server-side.

**Frozen-rules sweep: 3 `≤1-amber` violations found and fixed** (presentation-only,
pushed on `claude/maanta-acceptance-sweep-abm0w9`). **1 behavior-touching drift**
(success-takeover missing the COLLECT FROM SHOPPER amount) is listed for founder
sign-off, not fixed.

## Part 1 — golden-path E2E

| # | Check | Route | Result |
|---|---|---|---|
| 1 | Public feed renders signed-out; sections Flash · Boosted · Near Me; every card a cover image | `/feed` (anon) | PASS |
| 2 | Deal detail shows YOU PAY; Claim → Clerk sign-in (email+phone) → returns to deal | `/deals/[id]` | PASS |
| 3 | Code screen: 6-digit code, live ticking countdown, breathing amber border (R3), price outside code card, **0 amber actions** | `/tickets/[id]` (active) | PASS¹ |
| 4 | Merchant keypad-first → resolve (nothing charged) → "KES 30" disclosure → Confirm → green `#0A5C34` takeover + reference, 3 s auto-reset | `/merchant/redeem` | PASS² |
| 5 | Wallet: new ledger row w/ same reference; ledger sums to balance (540→510→480) | `/merchant/wallet` | PASS |
| 6 | Shopper's claim shows REDEEMED + same reference | `/tickets/[id]` (redeemed) | PASS |
| 7a | Wrong code → dark `#141414` failure, "No fee was charged", no ledger row | `/merchant/redeem` | PASS |
| 7b | Wallet < fee → verify still succeeds, fee → arrears row, redemption not blocked | `/merchant/redeem` (Bilan, KES 20) | PASS |
| 7c | New-deal creation blocked at 0 balance | `deals` INSERT / `/merchant/deals/new` | PASS³ |

¹ Grace: the code screen shows `Deal ends HH:MM · code valid until HH:MM` where the
"valid until" is deal-end + 15 min; the exact frozen phrase "plus a 15-minute grace
period" renders on the claim-confirm sheet. Both present. Minor: the code screen
itself doesn't spell out "15 minutes after the deal ends" (README S5 wording).
² See finding F1 below — takeover is green with reference + 3 s reset, but omits the
COLLECT FROM SHOPPER amount and masked phone the README M4 spec calls for.
³ Server trigger `enforce_zero_balance_gate` rejects the INSERT with
`INSUFFICIENT_BALANCE_FOR_NEW_DEAL`; the wizard's publish step surfaces a rust
top-up alert. (Gate lives on the publish step, not step 1.)

## Part 2 — frozen-rules sweep (25 route-states)

| Rule | Result |
|---|---|
| Closed vocabulary — grep `voucher\|coupon\|discount code\|Free plan` across the UI | **0 hits** — PASS |
| Money always `#111` tabular "KES 1,250", never in a toast | PASS — money values `#111`; struck originals `#3D3D3D` and white-on-dark are per-token; all money messaging is persistent InlineAlerts, never toasts⁴ |
| Failures dark not red | PASS — merchant failure `#141414`; error text `#111`, flame only on borders/icons |
| Every status = icon + word (greyscale-readable) | PASS |
| Dispute copy says 72 hours | PASS — shopper flagged-redemption screen: "resolve it within 72 hours" |
| Disabled = grey, never amber | PASS — `button.tsx` forces grey when disabled; 0 amber-disabled elements found |
| **≤1 amber action per screen (0 on code screen)** | **3 FAILS → FIXED** (F2); code screen verified 0 amber; fee-disclosure 1 amber |
| Tap targets ≥48px | Primary CTAs all ≥48px. Mobile secondary controls below 48px (F3, minor). Admin desktop sidebar 40px — not a touch surface |

⁴ Minor: two captions embed a money amount in muted `#6B6B6B` ("This week: … KES 120"
on the wallet footer; "Both plans pay the KES 30 success fee …" on new-deal) — the
token table says `#6B6B6B` is "NEVER money". Borderline (explanatory captions, not
money values); the `frozen-ui-rules` CI ratchet does not flag them.

## Findings & fixes

### Fixed — presentation-only (PR `chore: acceptance sweep fixes (pre-rehearsal)`)

**F2 — `≤1 amber action per screen` (L5) violated on 3 screens.**
- `src/components/nav/public-nav.tsx:33,38` — the shared nav's "Get started" / "My
  feed" CTA was amber, co-existing with each public page's own amber CTA → landing
  **3** amber actions (nav + hero + install prompt), `/waitlist` **2**. Demoted the
  nav CTA to `ghost`; each page's own primary CTA is now the single amber. → landing
  1, waitlist 1 (verified in-browser).
- `src/components/ui/inputs.tsx:272` (`AmountField`) — the selected top-up preset
  chip used `bg-brand` (amber), so `/merchant/topup` showed **2** amber actions
  (selected "3,000" + "Send STK push"). Switched to the ink-selected pattern
  (`bg-ink text-white`) used by `SegmentedControl`. → top-up 1 (verified).

`typecheck`, `lint`, and the 73-test vitest suite (incl. `frozen-ui-rules`) pass.

### Not fixed — behavior-touching (founder sign-off)

**F1 — Success takeover (M4) omits COLLECT FROM SHOPPER amount + masked phone.**
`src/components/ui/redemption-result.tsx` renders "Verified · KES 30 success fee
charged · Wallet balance · reference", but the README M4 board spec calls for a
prominent **`COLLECT FROM SHOPPER KES <you-pay total>`** (32px) and the masked
shopper phone. Surfacing the collect amount requires `/api/redemptions/verify`
(`src/app/api/redemptions/verify/route.ts`) to return the redemption's `amount_kes`
(the YOU-PAY snapshot) — a money-path API contract change, hence founder sign-off
rather than an in-sweep fix. The reference, green fill, and 3 s reset are already
correct.

### Minor / for founder awareness (not fixed)

- **Admin lists render >1 amber action.** `/admin/billing` shows 2 amber "Grant
  trial" (one per pending merchant); approvals similarly. `≤1 amber` is a
  mobile/money-surface discipline and the boards spec it per-detail-view; on a
  desktop admin table with per-row actions this is a divergence. Decide whether
  admin row actions should be ghost (`plan-actions.tsx`, `fraud-actions.tsx`, etc.).
- **F3 — mobile tap targets < 48px.** Secondary controls render below the 48px
  frozen minimum on mobile: my-claims tabs (36px), top-up presets (32px), wallet
  filter/copy chips (28–34px), public nav/footer text links (20px). Primary CTAs are
  all ≥48px. Fix touches shared `SegmentedControl`/chip components — broad, so left
  for a deliberate pass.
- **Code-screen grace wording** — add the explicit "15 minutes after the deal ends"
  to S5 (`tickets/[id]/page.tsx:204`), currently only on the claim sheet.
- **Admin dispute detail** has no visible 72 h SLA countdown (README A6) — feature
  gap, not a copy violation.

## Reproducing the local stack

Vercel/Supabase/Clerk hosts are outside egress; the sweep used a hand-built local
stack (Postgres 16 + PostgREST 14 via a `/rest/v1`→PostgREST shim, Clerk verified
with locally-minted JWTs). The two harness-only edits needed to run it —
`middleware.ts` passing `jwtKey` explicitly (Turbopack edge bundle drops the env)
and the `@supabase/ssr` `onAuthStateChange` guard under `accessToken` clients — were
reverted before commit and are **not** in the PR.
