# Notion sync pack — ready-to-apply (2026-07-21)

This is the exact content to apply to the Notion pages, using the **"current vs
superseded"** framing (honest "now" at the top; preserved "then" below; lineage via
the Decisions Log). It exists because the Notion writes are gated on the workspace
approval prompt — staging the copy here keeps it reviewable and loss-proof so
applying it is mechanical once approved.

**Apply order (per founder instruction):**
1. Append the 7 Decisions-Log entries (§0) — *this is the queued write; approve it.*
2. Then rewrite the 5 spec pages (§1–§5) with the blocks below.
3. Link each "Current state" to the repo artifacts (already inlined).

Source of truth for all of this is `docs/maanta-decisions-log.md` +
`docs/skills/repo-notion-audit-sync.md`.

---

## §0 — Decisions Log: 7 entries to append (end of page)

These are queued via `insert_content` (append). If the queued write was not
approved, re-run it. Titles:

- `2026-07-20 — Clerk replaces Twilio Verify for all auth`
- `2026-07-21 — Stripe Phase 1 is the primary top-up processor; IntaSend is legacy/Phase 2`
- `2026-07-21 — Multi-currency top-ups are in scope; deals stay single-currency`
- `2026-07-21 — Multi-node is a deployment capability, not user-visible scope`
- `2026-07-21 — Guardian fraud checks are PROPOSED, not implemented (spec over-claim corrected)`
- `2026-07-21 — Top-ups settle arrears FIRST`
- `2026-07-21 — Error state is never colour alone (message text in ink)`

Full bodies are the ones already drafted for the append (verbatim from the repo
Decisions Log). Do not delete any existing log content — append only.

---

## §1 — 🔒 Frozen Scope & Rules

**Prepend at top, under the ⚠️ banner:**

> ### Current state (as of 2026-07-21)
> - **Auth: Clerk is the sole auth provider.** Twilio Verify + Supabase OTP are
>   decommissioned. Clerk (phone OTP + email) is wired as a Supabase third-party auth
>   provider. → `20260720140000_clerk_third_party_auth.sql`, `src/lib/auth.ts`,
>   `docs/skills/clerk-auth.md`.
> - **Payments: Stripe Phase 1 is the primary top-up processor** (sandbox in
>   testing); IntaSend M-Pesa STK is the legacy/Phase-2 Kenya-launch rail, not
>   assumed. → `src/lib/stripe.ts`, `/api/topup/stripe`, `20260705191128_...`.
> - **Multi-currency top-ups are in scope** (KES/USD/EUR/GBP → KES at the ledger);
>   **deals stay KES-only, cross-currency deals out of scope.**
> - **Multi-node is a deployment capability, not user-visible scope** — product scope
>   is single mall (BBS/Node 0). Two Rivers / Sarit are scaffolded but `live:false`.
> - The KES 30 success fee, plan names, zero-balance gate, boost-Elite-only, image
>   requirement and feed structure below remain **unchanged and enforced in code**.

**Edit the do-not-build list — narrow two lines (do not delete, annotate):**
- "Multi-node / multi-city features…" → append: *"(deployment scaffolding for
  future nodes exists and is gated; single-mall product scope stands — superseded as
  a hard prohibition by the 2026-07-21 deployment-capability decision)."*
- Add under the tech-stack **superseded** note (see below) rather than the
  do-not-build list for multi-currency, since top-ups are now in scope.

**Tech stack table — mark the Auth + Payments rows superseded:**
- Auth row: *"Superseded by Clerk on 2026-07-20 — was Phone/OTP via Twilio Verify.
  Current: Clerk (phone OTP + email) as Supabase third-party auth provider."*
- Payments row: *"Superseded by Stripe Phase 1 on 2026-07-21 — IntaSend retained as
  Phase-2 rail."*

---

## §2 — 🏗️ Architecture

**Prepend "Current state (as of 2026-07-21)":**

> - **Auth = Clerk** (sole provider; Twilio Verify decommissioned). Clerk mints the
>   JWT; Supabase verifies it; `current_user_id()`/`current_user_role()` resolve
>   Clerk-primary with a legacy `auth_uid` fallback. Env: Clerk keys (publishable +
>   secret) replace the Twilio vars. → `20260720140000_clerk_third_party_auth.sql`,
>   `src/lib/auth.ts`, `src/middleware.ts`, `src/app/layout.tsx`.
> - **Payments = Stripe Phase 1 (primary) + IntaSend Phase 2 (legacy).** Env: add
>   Stripe keys + `STRIPE_WEBHOOK_SECRET`. → `src/lib/stripe.ts`,
>   `/api/webhooks/stripe`, `/api/topup/stripe`.
> - **Core loop = Postgres SECURITY DEFINER RPCs** (`claim_deal` /
>   `verify_redemption`) called from Next.js route handlers (`/api/redemptions/*`),
>   **not** Supabase Edge Functions. Behaviour identical; mechanism is RPC + route.
> - **Guardian fraud engine — velocity / geofence / collusion checks are PROPOSED,
>   not yet implemented (2026-07-21).** Live today: a `fraud_review` task on `unknown`
>   fee status + trust-metric recalculation. The `trust = 0.5·R + 0.3·A − 0.2·F`
>   formula and named heuristics are Future work (see below).
> - **Multi-node** (Deployment): the app can run multiple nodes; only BBS is live.

**Move the SMS/OTP strategy table + Twilio env vars + "all auth calls use
`supabase.auth.signInWithOtp`" line into a "Historical / superseded" section**,
prefixed: *"Superseded by Clerk on 2026-07-20."* Keep the text; do not delete.

**Move the Guardian detail (formula + thresholds + velocity/geofence/collusion) into
a "Future work / proposed" subsection**, prefixed: *"Proposed — not yet implemented
as of 2026-07-21."*

**Reword the Redemption-flow steps** that say "Edge Function" → "RPC
(`verify_redemption`) via `/api/redemptions/verify`".

---

## §3 — 💰 Revenue & Business Model

**Prepend "Current state (as of 2026-07-21)":**

> - **Primary top-up processor: Stripe Phase 1** (sandbox in testing). IntaSend
>   M-Pesa STK is the legacy/Phase-2 Kenya-launch rail, availability not assumed.
> - **Multi-currency top-ups** (KES/USD/EUR/GBP → KES) are live; deals stay KES-only.
> - **Elite subscription billing is automatic** via STK webhook — no manual
>   collection anywhere.
> - **Shopper YOU PAY price model** is live: a deal carries `price_kes` + disclosed
>   `charges`; YOU PAY = price + Σ charges, computed in one place (`src/lib/pricing.ts`),
>   shown identically on tile / detail / claimed code. This is shopper→merchant and
>   is **separate from** the KES 30 MAANTA success fee. → `20260719233037_...`.
> - **Node 0 opening credit = KES 300** granted by admin at activation to the first
>   100 launch merchants (promotional credit, same class as the free Elite trial;
>   not a collection). → `20260716084804_node0_opening_credit_on_activation.sql`.
> - Elite price review deferred to the **Feb 2027 Nairobi visit** (supersedes Oct 2026).

**Fix the two stale lines (mark superseded, keep history):**
- "Payment processor: IntaSend — IntaSend is the MVP payment processor" →
  *"Superseded by Stripe Phase 1 on 2026-07-21."*
- Elite subscription row "manual billing in MVP" → **correct to "automatic via STK
  webhook"** (this line also contradicted Frozen Scope + User Flows; the automatic
  rule is the frozen one).

---

## §4 — 🗺️ User Flows

**Prepend "Current state (as of 2026-07-21)":**

> - Onboarding / sign-in is via **Clerk** (phone OTP + email), not Twilio Verify.
>   Test users: the `/demo` page lists seeded shopper/merchant/admin logins
>   (email-OTP via plus-addressed inboxes) → `src/app/demo/page.tsx`,
>   `supabase/seed/node0_rehearsal_seed.sql`.
> - Verify runs as the `verify_redemption` **RPC** via `/api/redemptions/verify`,
>   not a Supabase Edge Function. Guardian velocity/geofence/collusion checks are
>   **proposed, not yet implemented** (2026-07-21).

**Mark superseded (keep text):** the "receive OTP via Twilio Verify" onboarding
steps → *"Superseded by Clerk on 2026-07-20."* The "Edge Function" wording in Verify
→ RPC + route handler.

---

## §5 — 🧪 Testing & QA

**Prepend "Current state (as of 2026-07-21)":**

> - **Auth in tests = Clerk** (SQL suites authenticate by setting `sub = users.auth_uid`
>   / `clerk_user_id`); the "phone → Twilio OTP → Supabase session" line is superseded.
> - **CI = two jobs** (`.github/workflows/ci.yml`): `ci` (lint → typecheck → vitest →
>   build) and `db-tests` (applies all migrations, psql-loops all 6 `supabase/tests/*.sql`).
> - **Money-path coverage is machine-tested at the RPC/SQL layer:** three
>   `feeChargeStatus` outcomes, settle-first, ledger reconciliation, RLS cross-role,
>   YOU PAY snapshot. Suites: `golden_path`, `verify_redemption_money_path`,
>   `topup_settles_arrears`, `success_fee_reference_link`, `node0_opening_credit`,
>   `security_hardening`.
> - **Browser golden-path (Playwright) is not scaffolded** — deliberate, depends on a
>   live Supabase + Clerk env; RPC-level golden path is covered.

**Mark superseded (keep text):** the "phone → Twilio OTP → Supabase session" critical
flow → *"Superseded by Clerk on 2026-07-20."*

---

## Checklist to close this sync (per the frozen per-change rule)

- [x] Code correct (verified in audit; no repo-wrong findings)
- [x] Tests present + CI green (`ci` + `db-tests`)
- [x] Repo Decisions Log updated (7 entries + D10 correction)
- [x] Notion Decisions Log mirrored — **DONE 2026-07-21** (7 entries appended, verified once each)
- [x] Notion spec pages updated — **DONE 2026-07-21** (§1–§5 applied; Current-state + superseded markers, history preserved)

**This pack is now a record of what was applied, not a to-do.** Reuse its per-page
blocks as the template for future "current vs superseded" syncs.
