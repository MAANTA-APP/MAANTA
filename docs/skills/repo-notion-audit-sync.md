# Repo ↔ Notion audit & sync (2026-07-21)

**Session type:** Reviewer / Operator. **Scope:** audit the code against the Notion
operating source of truth across the four drift-prone surfaces (money & pricing,
surfaces & flows, rules & guardrails, tests & CI + auth), decide the direction of
sync for every divergence, and make Notion a living mirror of what the code
actually does.

**Method:** four parallel repo audits (file/line evidence) cross-checked against
the live Notion pages under *MAANTA — Build OS*. Every claim below is anchored to a
concrete repo artifact so any Notion page can point straight at the code that backs
it.

**Headline verdict:** the **code is correct and ahead**; **Notion is stale** on the
two biggest architecture changes (auth and payments). No `repo-is-wrong` findings —
every frozen *money* rule and *guardrail* is enforced in code. The drift is
governance drift: Notion's Frozen Scope / Architecture / Revenue pages and its
Decisions Log never absorbed the Clerk auth swap, the Stripe Phase-1 rail,
multi-currency, or the 2026-07-21 corrections. `docs/maanta-decisions-log.md` (repo)
is the accurate record; Notion lags it.

---

## 1. Direction-of-sync drift map

Legend — **Direction**: `→Notion` = code is correct, update Notion; `decide` =
deliberate scope change, log a decision then update both; `→repo` = Notion is
correct, open a ticket to fix code (none found this pass).

| # | Item | Repo reality (authoritative) | Notion says (stale) | Direction | Action |
|---|------|------------------------------|---------------------|-----------|--------|
| **D1** | **Auth = Clerk**, not Twilio Verify | Fully on Clerk: `migrations/20260720140000_clerk_third_party_auth.sql` (adds `users.clerk_user_id`, re-points `current_user_id()`/`current_user_role()`); `src/lib/auth.ts` (`ensureAppUser`), `src/middleware.ts` (`clerkMiddleware`), `src/app/layout.tsx` (`<ClerkProvider>`), `src/lib/supabase/{server,client}.ts` (Clerk `accessToken`), `src/app/{login,sign-up}/[[...rest]]`. **Zero Twilio code in `src/` or `package.json`.** | Frozen Scope tech stack ("Phone/OTP via Twilio Verify"); Architecture ("all auth calls use `supabase.auth.signInWithOtp`", Twilio env vars, "migration = change two fields in Supabase Auth dashboard"); User Flows ("OTP via Twilio Verify"); Testing & QA ("phone → Twilio OTP → Supabase session") | →Notion | Rewrite auth on all 4 pages to Clerk-as-Supabase-third-party-auth; add Clerk env vars, drop Twilio vars; **add the missing Clerk entry to the Notion Decisions Log** |
| **D2** | **Payments = Stripe (Phase 1) + IntaSend (Phase 2)** | `src/lib/stripe.ts`, `src/app/api/webhooks/stripe/route.ts`, `src/app/api/topup/stripe/route.ts`, `migrations/20260705191128_allow_stripe_payment_provider.sql`; test `src/app/api/webhooks/stripe/__tests__/route.test.ts`. IntaSend prepared (`src/lib/intasend.ts`) but availability not assumed | Revenue & Business Model ("IntaSend is the MVP payment processor"); Frozen Scope + Architecture (payments = IntaSend only, no Stripe env vars) | →Notion | Add Stripe as Phase-1 rail on Revenue/Architecture/Frozen Scope; add Stripe env vars; keep IntaSend as Phase-2/Kenya-launch |
| **D3** | **Multi-currency top-ups (KES/USD/EUR/GBP + live FX)** | `migrations/20260708231241_add_multicurrency_and_webhook_failure_log.sql`, `src/lib/currency.ts` (`SUPPORTED_CURRENCIES`), `src/app/api/topup/stripe/route.ts`. **API-level only — `topup-flow.tsx` exposes no currency selector (KES-only in practice)** | Frozen Scope do-not-build list still forbids "Multi-currency" | **decided → keep** | **Founder call 2026-07-21: keep & document.** Multi-currency *top-ups* are in launch scope (quiet Stripe-Phase-1 bonus); **deals stay single-currency (KES), cross-currency deals out of scope.** Narrow the Frozen Scope do-not-build line accordingly. Decision logged (repo + Notion) |
| **D4** | **Shopper YOU PAY price model** | `migrations/20260719233037_shopper_you_pay_price_model.sql`, `src/lib/pricing.ts` (single source), consumed by tile/list (`feed/page.tsx`), detail (`deals/[id]/page.tsx`), claimed code (`tickets/[id]/page.tsx`) | In Notion Decisions Log, but **not** reflected on Revenue & Business Model or Product Brief deal descriptions | →Notion | Add YOU PAY (price_kes + disclosed charges, shopper→merchant, separate from the KES 30 success fee) to Revenue + Product Brief |
| **D5** | **Elite subscription billing is automatic (webhook), never manual** | Subscription collection is webhook-driven; no manual-billing code path | **Notion self-contradiction:** Revenue page says "manual billing in MVP"; Frozen Scope + User Flows say "fully automatic via STK webhook, no manual collection" | →Notion | Fix the Revenue page line to "automatic via STK webhook" so Notion agrees with itself and with code |
| **D6** | **Node 0 opening credit = KES 300** (first 100 activated) | `migrations/20260716084804_node0_opening_credit_on_activation.sql` (inline in `activate_merchant`); test `supabase/tests/node0_opening_credit_test.sql`; reads `app_config` | In Notion Decisions Log (07-16); not on the Revenue "Launch promotion" section | →Notion | Add the KES 300 opening credit alongside the 30-day Elite trial on Revenue |
| **D7** | **Multi-node scaffolding present but gated** | `src/lib/nodes.ts` lists Two Rivers + Sarit as `live:false`, BBS `live:true`; `/select-mall`; node filtering in `data.ts`. Only BBS is live/selectable | Frozen Scope do-not-build forbids multi-node/multi-city | **decided → keep** | **Founder call 2026-07-21: keep & document as a *deployment capability*, not user-visible scope.** Product scope stays single mall (BBS/Node 0). Document under Architecture → Deployment, not the launch feature set. Decision logged (repo + Notion) |
| **D8** | **Guardian fraud engine — Notion claims more than code** | `verify_redemption` creates a `fraud_review`/`high` `agent_tasks` row on `unknown` fee status; trust metric recalculated (`recalculate_trust_metric`). The named heuristics (velocity / geofence / collusion) were **not** observed as live checks in the verify path | Architecture + User Flows describe Guardian velocity/geofence/collusion checks and `trust = 0.5·R + 0.3·A − 0.2·F` running at verify | **decided → relabel proposed** | **Founder call 2026-07-21: relabel as proposed, not done.** The named velocity/geofence/collusion checks are not built; only the fraud-task-on-`unknown` + trust recalc are live. Reword Architecture/User Flows to "proposed / not yet implemented (2026-07-21)" and move detail to Future-work. No silent "done" for money/fraud. Implementation is its own future ticket. Decision logged |
| **D9** | **Core loop = Postgres RPCs, not Supabase Edge Functions** | `claim_deal` / `verify_redemption` are SECURITY DEFINER RPCs called from Next.js route handlers (`src/app/api/redemptions/*`). No Supabase Edge Function implements the core loop | Architecture + User Flows describe claim/verify as "Edge Function" | →Notion | Reword Architecture/User Flows: core loop is RPC + route handler (behaviour identical; mechanism differs). Per CLAUDE.md, code wins for how the product behaves |
| **D10** | **Elite price review = Feb 2027, not Oct 2026** (reverse drift — Notion ahead) | `CLAUDE.md` frozen rules + `docs/maanta-decisions-log.md` still said "price under review Oct 2026" | Notion Decisions Log entry **2026-07-20 — Elite pricing frozen at KES 3,500/month**: review deferred to the Feb 2027 Nairobi market-research visit, explicitly superseding Oct 2026 | →repo (**done this session**) | Repo mirror corrected: `CLAUDE.md` + decisions-log frozen row + pending row now read "Feb 2027 (founder ruling 2026-07-20, supersedes Oct 2026)" |

### Missing from the Notion Decisions Log (governance gap)

The Notion log is current to 2026-07-20 but is missing three entries that exist in
`docs/maanta-decisions-log.md`:

- **2026-07-20 — Clerk auth** (biggest architecture change; **absent entirely** — the
  word "Clerk" appears nowhere in the Notion log).
- **2026-07-21 — Top-ups settle arrears first** (`arrears_settlement` ledger type;
  `migrations/20260721120000_topup_settles_arrears_first.sql`).
- **2026-07-21 — Error-state text in ink, never colour alone** (frozen-UI CI ratchet).

**Status: DONE.** These three (plus four more — Stripe-primary, D3, D7, D8) were
appended to the Notion Decisions Log during this session as `## date — title` prose
entries. Verified present exactly once each; no existing content removed.

---

## 2. What matches (no action — these are load-bearing and correct)

**Money path — all MATCH, no repo-wrong findings:**
- Settle-arrears-first: `20260721120000_topup_settles_arrears_first.sql` pays
  `LEAST(arrears, amount)` first, credits only the remainder, writes the full topup
  row + a `−settled` `arrears_settlement` row; reached by every webhook via
  `src/lib/merchant-ledger.ts` `recordMerchantTransaction`.
- YOU PAY single source: `src/lib/pricing.ts` (`youPay`/`dealPricing`); extras
  itemised only in deal detail; never mixed with the KES 30 success fee.
- Success fee pinned to KES 30 (no price-review caveat):
  `20260702094145_harden_success_fee_amount.sql` (`app_config.success_fee_kes=30.00`,
  hard fallback, write-trigger, deduct rejects any non-canonical amount).
- Three `feeChargeStatus` outcomes (`charged`/`owed`/`unknown`), `unknown` never
  collapsed to `owed`, creates a fraud-review task; balance never negative.

**Guardrails — all ENFORCED (DB or CI):**
- Zero-balance gate (`20260703190627_...`), boost Elite-only server-side
  (`20260715194145_...`, not bypassable by admin/service_role), image required
  NOT NULL + API (`baseline` + `api/deals/route.ts`), deal limits 1/2 + flash
  Elite-only + 24h/flash expiry (baseline triggers).
- Frozen-UI CI ratchets in `src/lib/__tests__/frozen-ui-rules.test.ts`:
  money-never-amber, error-text-in-ink, failure-takeover-dark, closed vocabulary
  ("Free plan" banned); `visibility.test.ts` pins the 3-clause public predicate.
  **Zero violations found.**

**Surfaces — MATCH (feared do-not-build conflicts are benign):**
- Shopper `/tickets/[id]` = the redemption-code credential (S5 claimed code), **not**
  a support ticket. Merchant `/support` = static FAQ + WhatsApp CTA. Admin `/support`
  = audit-trailed `agent_tasks` dispute queue. None is the forbidden in-app
  chat/ticketing.
- `/(shopper)/profile` = account settings only (no loyalty/ratings/reviews/social).
- 3-section feed (Flash → Priority Placements → Deals Near Me, ranked by verified
  redemptions) confirmed in `src/lib/data.ts` `getLiveDeals` + `feed/page.tsx`.
- Search, favourites, web-push are in-scope per the Product Brief.

**Tests / CI — MATCH:**
- CI (`.github/workflows/ci.yml`) = job `ci` (lint → typecheck → vitest → build) +
  job `db-tests` (applies all migrations, psql-loops all 6 `supabase/tests/*.sql`).
- SQL suites: `golden_path`, `verify_redemption_money_path`, `topup_settles_arrears`,
  `success_fee_reference_link`, `node0_opening_credit`, `security_hardening`.
- 8 vitest suites (pricing, currency, merchant-ledger, frozen-ui-rules, visibility,
  boosts ×2, stripe webhook).

---

## 3. Notion page → repo artifact map

Make each Notion page point at these so a reader (human or model) can jump straight
to the code that backs the statement.

| Notion page | Backing repo artifacts |
|---|---|
| Frozen Scope & Rules | Frozen-UI ratchets `src/lib/__tests__/frozen-ui-rules.test.ts`; guardrail migrations `20260703190627` (zero-balance), `20260715194145` (boost Elite-only), `baseline 20260630231915` (image/limits/expiry) |
| Architecture | Auth: `20260720140000_clerk_third_party_auth.sql`, `src/lib/auth.ts`, `src/middleware.ts`; Payments: `src/lib/{stripe,intasend}.ts`, `api/webhooks/{stripe,intasend}`; core loop RPCs `claim_deal`/`verify_redemption` |
| Revenue & Business Model | Fee: `20260702094145_harden_success_fee_amount.sql`; YOU PAY: `src/lib/pricing.ts` + `20260719233037_...`; ledger: `src/lib/merchant-ledger.ts` + `20260721120000_...`; Node 0 credit: `20260716084804_...` |
| Testing & QA | `.github/workflows/ci.yml`; `supabase/tests/*.sql` (6 suites); 8 vitest suites |
| User Flows | Claim/verify RPCs + `api/redemptions/*`; feed `src/lib/data.ts`; onboarding `src/app/{login,sign-up}` (Clerk) |
| Product Brief | YOU PAY `src/lib/pricing.ts`; feed sections `feed/page.tsx`; search/favourites/push routes |
| Decisions Log | 1:1 mirror of `docs/maanta-decisions-log.md` (currently 3 entries behind) |

---

## 4. Follow-up tickets (gaps — not drift, deliberate or minor)

1. **YOU PAY parity test.** A SQL mirror `you_pay_kes` (`20260720120000_security_hardening.sql`)
   computes the claim-time snapshot atomically inside `claim_deal`, parallel to
   `src/lib/pricing.ts`. They agree today (both pinned to the 572 example) but no test
   asserts SQL == TS. Add a shared case table / parity test so the "one source of
   truth for YOU PAY" guarantee can't silently erode.
2. **Forbidden-term ratchet is partial.** Only "free plan" is CI-checked in
   `frozen-ui-rules.test.ts`; commission / listing fee / transaction cut /
   percentage take rely on manual review. Add them to the banned regex (allow the
   permitted negations already in the marketing pages).
3. **Browser golden-path E2E (Playwright).** Deliberately not scaffolded — depends on
   a live Supabase + Clerk test env. RPC-level golden path is covered. Standing
   pending decision.
4. **Guardian named checks (D8)** — implement velocity/geofence/collusion or mark
   proposed in Notion.
5. **Migration-stamp citations.** A few `docs/maanta-decisions-log.md` entries cite
   pre-rename stamps (e.g. YOU PAY as `20260718120000` vs actual
   `20260719233037`; Node 0 credit `20260716120000` vs `20260716084804`) from the
   07-20 reconciliation. Cosmetic; fix on next log edit.

---

## 5. Lightweight sync rules (keep this from decaying)

**When you ship a money-related change:** update code → add/update a test (vitest or
`supabase/tests/*.sql`) → add a `docs/maanta-decisions-log.md` entry → mirror the
entry into the Notion Decisions Log → update the affected Notion page.

**When you write a new Notion spec:** either open a ticket to implement it, or mark it
**"proposed — not yet implemented"** until a branch lands. Never let Notion assert a
behaviour the code doesn't have (that's how D8 happened).

**Per significant change, tick all five:**

- [ ] Code updated
- [ ] Tests written and passing (CI green: `ci` + `db-tests`)
- [ ] `docs/maanta-decisions-log.md` entry added
- [ ] Notion Decisions Log mirrored
- [ ] Relevant Notion page updated + points at the repo artifact

**Source-of-truth reminder (CLAUDE.md):** Notion wins for operations; code +
migrations win for how the product behaves. When they disagree, **flag the drift** —
don't silently pick one. This audit is that flag.

---

*Audit run 2026-07-21. Repo side verified at file/line; Notion side verified against
live pages under MAANTA — Build OS.*

**Applied this session:** the D10 repo correction (Elite price review → Feb 2027)
and the three missing Decisions-Log entries appended to Notion (D1/settle-first/
error-in-ink), the latter pending the Notion workspace approval gate.

**Founder calls made 2026-07-21 (logged in the Decisions Log):** D3 multi-currency
→ keep & document (top-ups only; deals stay KES); D7 multi-node → keep as a
deployment capability, not user-visible scope; D8 Guardian → relabel proposed, not
done. Plus the standing ratification that Stripe Phase 1 is the primary top-up
processor and IntaSend is legacy/Phase 2.

**Notion page rewrites — DONE (2026-07-21), "current vs superseded" framing:** each
of Frozen Scope / Architecture / Revenue & Business Model / User Flows / Testing & QA
now carries a top "Current state (as of 2026-07-21)" section linked to the repo
artifacts in §3, with the old Twilio / IntaSend-MVP / Edge-Function / manual-billing
text marked in place ("Superseded by Clerk 2026-07-20" / "Superseded by Stripe
Phase 1 2026-07-21" / "corrected 2026-07-21") — history preserved, never deleted.
Guardian relabelled proposed on Architecture + User Flows. YOU PAY + Node 0 credit +
Feb-2027 price review added to Revenue; price-review + billing cells fixed on Frozen
Scope. Sync complete: repo and Notion now agree, with lineage in the Decisions Log.*

**Resync verification (2026-07-21):** re-fetched all 5 pages + the Decisions Log —
each carries exactly one "Current state" section and all superseded markers (no
double-insert from the connector reconnects), and the 7 log entries are present once
each. One residual inline inconsistency fixed: Architecture redemption-flow step 3
now marks the Guardian velocity/geofence/collusion checks "proposed", matching the
page's relabel. Repo↔Notion confirmed consistent.*
