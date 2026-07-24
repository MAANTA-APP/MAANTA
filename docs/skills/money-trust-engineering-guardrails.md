# Skill — Money-and-trust engineering guardrails

Last updated: 2026-07-20 · Status: **repo-side prompt/checklist for any session
(Claude or human) editing code that shows a price, moves money, or gates a
role.**

This is the MAANTA-grounded version of the generic "careful engineer on a
money product" prompt. Where the generic prompt says "the product moves money"
this file names the actual files, columns, and RPCs that make it true, so a
reviewer can check a diff against the code instead of against a vibe. It does
not introduce any new business rule — every rule here already lives in
`CLAUDE.md` (Frozen business rules), `maanta-decisions-log.md`, or
`security-hardening.md`. If this file and one of those disagree, they win and
this file is stale — fix it.

## Role

Act as a careful engineer, not a designer:

- Never ship code that could **lie about a price** or **weaken access control**.
- Prefer extending the existing pattern over inventing a new one — the trust
  properties below are already enforced in one place each; a second place is a
  second thing that can drift.
- Explain every change in the commit/PR body: what changed, why (bug / trust
  rule / perf), and how it was verified (which tests, which suite).

## Hard rules, mapped to the code that enforces them

### 1. Price correctness — one number, computed once

- `YOU PAY = deal price + every disclosed extra`, rounded to whole KES. It is
  computed **only** in `maanta-app/src/lib/pricing.ts` (`youPay` →
  `dealPricing`). The tile, deal detail, and claimed code all read
  `dealPricing`, so they cannot disagree. A disagreement is the product lying.
- The claim **snapshots** the number: `claim_deal` writes `redemptions.amount_kes`
  via the DB-side `you_pay_kes()` in the *same INSERT* as the claim (migration
  `20260720120000_security_hardening.sql`; regression in
  `security_hardening_test.sql` scenario for the claim snapshot). Do not add a
  code path that computes the shopper price outside `pricing.ts` or reads it
  back into a record after the fact.
- The itemised breakdown appears **only** in deal detail; everywhere else
  extras collapse to the single line from `extrasSummary` ("Includes KES N in
  taxes and charges"). Never surface a "from KES …", a strikethrough, or a
  bare subtotal in a position where a shopper would read it as the final price.
  `compare_at_kes` is a *was* price and `dealPricing` only returns it as `was`
  when it is strictly greater than `pay` — keep that guard.

### 2. Fee transparency — before the action, in the same view

- The **KES 30 success fee** is read from `app_config` via
  `getSuccessFee()` (`src/lib/data.ts`) — **never hardcode 30** (the literal
  `30` there is only a last-resort fallback if config is missing). Same for the
  boost fee (`getBoostFee`).
- Any fee that a merchant action will incur must be shown in that view before
  the merchant commits the action. The fee is debited at verification and
  recorded as `success_fee` (or `success_fee_arrears` when the wallet can't
  cover it) through the ledger — it must never appear *only* in a webhook, a
  toast, or a log.

### 3. Money + code readability

- Follow the Frozen UI (Pass 2) rules already documented in
  `frozen-ui-overall-handoff.md`: labelled currency everywhere, tabular/`.tnum`
  figures, slashed-zero `.font-code` for codes.
- The **redemption OTP is the only bare numeral**. Every other number carries a
  currency or unit label. Do not add tiny fonts, low-contrast text, or
  decorative gradients over prices or codes.

### 4. State clarity — never color alone

- Every state a shopper or merchant can land in (success, failure, pending,
  arrears, expired, already-redeemed) must be distinguishable by **icon + word
  + shape/structure**, not hue. This is decisions-log rule L12 and is already
  wired through `ClaimChip` and the rust `InlineAlert`s. Warning is rust
  (`#9A4A0C`), never red/yellow.
- The merchant redeem flow's invalid / expired / already-redeemed branches
  (`/merchant/redeem`, see `redemption-disputes.md`) each need their own
  word+icon, not a shared red banner.

### 5. Security posture — do not relax to make a change convenient

- **Sensitive DB work is service-role-only, SECURITY DEFINER RPCs.** Money and
  rate-limit paths go through them: `record_merchant_ledger_entry`
  (`merchant-ledger.ts`, atomic idempotent ledger + balance), `check_rate_limit`
  (`rate-limit.ts` — anon **and** authenticated are revoked; see the
  `20260720123000` follow-up for why authenticated is not free). Do not call
  these from a browser client and do not widen their `EXECUTE` grants.
- **Anon PostgREST clients read the browse views** `merchants_public_browse` /
  `deals_public_browse`, never the base tables (anon `SELECT` is revoked). A new
  anon-visible column means a new/edited view, deliberately.
- Merchant actions authorize through `requireMerchant` (`merchant-api.ts`) /
  `merchant_verify_authorized()`; the zero-balance gate blocks deal creation.
  Keep these. If you add an RPC or route, state which role may call it and prove
  the others cannot (a negative test, like `security_hardening_test.sql`
  scenario G).
- OTP input is validated (`isValidOtpCode`, `^\d{6}$`) and never echoed back in
  a claim response. Keep it that way.

### 6. No silent breaking changes

- Do not delete a test without adding equal-or-stronger coverage. Pricing lives
  in `src/lib/__tests__/pricing.test.ts`; ledger in `merchant-ledger.test.ts`;
  DB behavior in `supabase/tests/*.sql` (run end-to-end in CI `db-tests`).
- Schema or contract changes ship as a new migration in
  `supabase/migrations/` (the authoritative record), with the SQL tests and
  obvious call sites updated in the same change. A migration must be applied to
  the Supabase project before the deploy that reads the new columns.

## Founder-level — stop and ask before proceeding

Use `AskUserQuestion` (do not assume) if a change would:

- alter how `YOU PAY` or any shopper-facing price is computed or displayed;
- change the success-fee amount, when it is debited, or the arrears rule;
- relax RLS, a function `EXECUTE` grant, auth, or rate limiting;
- touch the live production database (**`axrrslqssmbngbataejg`**, MAANTA-APP org
  — there is no separate staging; the old `vcrfqsevompqjazbwzyh` ref is not
  production. See `docs/ops/supabase-migrations.md`).

These are frozen business rules; changing one needs a `maanta-decisions-log.md`
entry first, per `CLAUDE.md`.

## How to work a task here

1. Restate the task; classify it (feature / fix / refactor / investigation).
2. Read the module, SQL, and tests that already touch the behavior — start from
   the file references above.
3. Propose a small, reversible plan (files, functions, tests).
4. Implement with tests written before or alongside the code; run the relevant
   suite (`npm test`, plus `db-tests` if SQL changed).
5. Explain the change (what / why / how verified) in the commit or PR body.
6. Hit a founder-level trigger → stop and ask.

## Checklist for the next session touching money/price/role code

1. Read this file, `CLAUDE.md` (Frozen business rules), and the relevant skill
   doc (`security-hardening.md`, `redemption-disputes.md`, or
   `frozen-ui-overall-handoff.md`).
2. Confirm the diff keeps price computation inside `pricing.ts`, the fee out of
   hardcoded literals, and sensitive DB paths behind service-role RPCs.
3. Run `npm test` (and `db-tests` for SQL); note the result in the commit body.
4. Update this file's file references if any of them moved.
