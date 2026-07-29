# Skills: UI walkthrough — all four roles (shopper / merchant / admin / agent)

> **Design truth:** for *current-state* screens, routes and runtime rules the
> canonical source is `maanta-app/design/current-reality/` (see
> `docs/design-truth-protocol.md`). This document is a dated handoff — treat it
> as provenance and design intent, not as current-state authority.

**Date:** 2026-07-22 · **Env:** live app `www.maanta.app` (Vercel prod, build
`mV511WCbzlvUZ134NGUnY`) on Supabase project **`axrrslqssmbngbataejg`** (MAANTA-APP
org), Clerk instance `cheerful-sailfish-3`. **Method:** observational — no product
code changed. Spec authority: `frozen-ui-locked-rules-audit.md` (R1–R7),
`frozen-ui-overall-handoff.md`, `maanta-design-brief` tokens.

## How this walkthrough was done (and its one limitation)

Every role is gated behind Clerk sign-in (browser OAuth), which can't be
completed from the headless review environment, and raw egress to the app is
proxy-restricted. So **authenticated screens were audited from code + spec, not
click-driven**, while these were exercised **live**:

- **Signed-out live fetches** of the real deployed shopper surfaces (feed, deal
  detail) via the Vercel connector — real rendered HTML, quoted below.
- **Seeded a real deal** on the live DB and confirmed it renders end-to-end, then
  **removed it** (DB is back to 0 merchants/deals/redemptions, 2 real users).
- **Drove the core money loop at the RPC/RLS layer** on the live DB (claim →
  credential), exercising the real Clerk→`current_user_id()` identity path.

A true browser golden-path (Playwright + Clerk test-mode creds) remains the
right follow-up for pixel/interaction coverage — already tracked in
`frozen-ui-locked-rules-audit.md` §"Follow-up".

## Live evidence captured (shopper)

Seeded deal *Nyama Choma Platter for Two* (price 450 + VAT 16% + KES 30 service +
KES 20 packaging). The live app rendered:

- **`/feed`** — tile: `You pay` **KES 572** in `tnum text-lg font-bold text-ink`
  (money is **ink, not amber**), `KES 700` struck-through, "Standard" chip
  `border-ink` (not amber), "0 verified redemptions" with a green check
  (icon+word), countdown chip `bg-white/95`. Only amber on screen = the nav
  active-tab indicator bar.
- **`/deals/[id]`** — back arrow present; **YOU PAY KES 572** (2xl bold ink);
  "Includes KES 122 in taxes and charges"; **itemised breakdown shown only here**
  (Deal price 450 · VAT 72 · Service 30 · Packaging 20 · **Total you pay 572**);
  a **single amber action** "Claim deal" (`bg-brand text-black`).
- **Claim (RPC)** — produced code **`981101`**, expiry = **deal expiry + 15 min**
  (frozen rule), and snapshotted **`redemptions.amount_kes = 572.00`** (= YOU PAY)
  and **`success_fee_charged = 30.00`** (frozen KES 30). This is exactly the S5
  credential content, proving R7's promise carries from tile → detail → ticket.

**Verdict:** the Locked Rules that can be seen without signing in (R1/R2/R3/R4/R5/R7)
hold on the live shopper app; YOU PAY is identical across tile/detail/snapshot.

---

## 1. Shopper

**Routes/screens (code):** `/` (landing), `/feed`, `/deals`→redirect `/feed`,
`/deals/[id]` (+ `claim-flow.tsx`), `/tickets/[id]` (S5 `claimed-code.tsx` +
`ticket-watcher.tsx`), `/shops/[id]`, `/my-deals`, `/search`, `/select-mall`,
`/profile`, `/notifications` (+ `/preferences`), `/help`; shell `(shopper)/layout.tsx`
+ `shopper-top-bar.tsx` + `bottom-bars.tsx`.

**Locked-rule verdicts:** R1 PASS (disabled→grey `button.tsx:67`; one amber
primary/screen; tab indicator is the single amber mark) · R2 PASS (`text-brand`
only on dark surfaces) · R3 PASS (every "You pay" is `text-ink`; no toasts/confetti;
`redemption-result.tsx` "Money moved; it is not a party") · R4 PASS (expired/failed
in greyscale; flagged alert body `text-ink`, red only on border+`!`) · R5 PASS
(no voucher/coupon/points) · R6 PASS (**S5 card holds only label+code+countdown**;
price rendered outside) · R7 PASS (single source `lib/pricing.ts`; itemised only
on detail).

**S5 deep-dive (`tickets/[id]/claimed-code.tsx`) — CONFIRMED:** card =
`border-[2.5px] border-brand bg-white`, children exactly label "For the shop" +
`formatCode(code)` + live countdown; price/split render *after* the card; zero
amber actions (only the `animate-r3` breathing border, R3-sanctioned); a real
per-second `setInterval(…,1000)` tick with the anti-screenshot copy "If the timer
isn't moving, it's a screenshot."

**Issues (all low unless noted):**
| # | Issue | File | Sev | Low-risk fix? |
|---|---|---|---|---|
| S1 | Feed tiles omit the "Includes KES N in taxes and charges" collapse line (spec says everywhere except detail); total is honest so not a price lie | `components/ui/cards.tsx:89-103,143-147` | low | Yes — add `extrasSummary` under tile price |
| S2 | `/select-mall` has **no back nav** and sits outside `(shopper)/` so it renders with no tab bar — a shopper landing there is stranded | `app/select-mall/page.tsx` | **low–med** | Yes-ish (add back link) |
| S3 | Claim error uses `rust` (warning) token instead of `flame` (error) + hand-rolls the alert vs `InlineAlert` | `deals/[id]/claim-flow.tsx:113-117` | low | Yes |
| S4 | Merchant plan word ("Elite"/"Standard") leaks onto a shopper tile (`PlanChip` mapping deal type→tier) | `cards.tsx:105` | low | Judgement call |
| S5 | Rail titled "Priority Placements" but chip/param say "Boosted" | `feed/page.tsx:80` vs `chips.tsx:33` | low | Yes |
| S6 | Several leaf screens (`/help`,`/notifications`,`/my-deals`,`/profile`,`/search`) rely only on the tab bar for back-nav | — | low | Optional |
| S7 | Latent: dead `TicketCard` (`cards.tsx:157-210`) puts pulse-border + `text-rust` expiry *inside* a card — would break R6 if ever used (currently unrendered) | `cards.tsx` | low | Delete/ignore |

---

## 2. Merchant

**Routes/screens (code):** `/merchant`, `/merchant/onboard` (+ `onboard-wizard.tsx`),
and under `(app)/`: `dashboard`, `redeem` (+ `redeem-keypad.tsx`), `redemptions`,
`wallet` (+ `wallet/[id]`), `topup` (+ `topup-flow.tsx`), `plan` (+ `upgrade`,
`success-fee`), `deals` (+ `deals/new` `new-deal-wizard.tsx`, `deals/[id]`,
`deals/archived`), `staff` (+ `new`, `[id]`), `alerts`, `more`, `settings`,
`support`; shell `(app)/layout.tsx` + `merchant-top-bar.tsx`.

**Frozen-behaviour verdicts:**
- **Create-deal M8/M9 — PASS.** `extrasChoice` starts `null` (neither preselected,
  `new-deal-wizard.tsx:38`); Continue `disabled={!priceReady}` where `priceReady`
  requires a choice (`:62-66,441`) — **unskippable**; review CTA carries the number:
  `Publish — shoppers pay KES ${previewPay}` (`:538-540`); **no counter-side charge
  field** exists (redeem keypad + `/api/redemptions/verify` take only the OTP).
- **Redeem fee-before-confirm + verify-anyway — PASS.** Preflight discloses the fee
  and "charges nothing" (`redeem-keypad.tsx:96-129`); `FeeDisclosure` sits above the
  single `Confirm redemption — {fee} fee` button; Confirm is never disabled by
  wallet state (verify-anyway); underfunded → `owed`/arrears on the success takeover
  while the shopper still sees "Verified".
- **Zero-balance gate — PASS (rule), CONCERN (affordance).** Enforced by DB trigger
  + `/api/deals` 402; **but** the wizard never receives `balance`, so a broke
  merchant completes the whole flow and the block appears only at Publish as **plain
  text with no top-up CTA** (`new-deal-wizard.tsx:535`).
- **Wallet/arrears/ledger — PASS.** Arrears/low/empty are persistent rust
  `InlineAlert`s (never toasts); ledger reconciles top-down from current balance;
  money uncoloured everywhere (`wallet-balance.tsx:15`, `wallet/page.tsx:154`).

**Locked-rule verdicts:** R1 PASS · R3 PASS (grep: no money in flame/verified/rust) ·
R4 PASS-with-concern · R5 PASS (minor font note).

**Issues:**
| # | Issue | File | Sev | Low-risk fix? |
|---|---|---|---|---|
| M1 | Zero-balance publish failure is bare text with **no top-up CTA**; wizard lacks `balance` so block only shows at the end | `new-deal-wizard.tsx:535` | **med** | Yes |
| M2 | Top-up **failure** screen is light-bg + flame-red icon, not the dark `ink-900` treatment used for redeem failure (R4 "failures dark not red") | `topup-flow.tsx:153-158` | low–med | Yes (design-intent call) |
| M3 | OTP code + provider reference use `font-mono` not `.font-code`, losing slashed-zero on cashier-read codes | `wallet/[id]/page.tsx:80,86` | low | Yes |
| M4 | Boost sheet shows an amber `Pay from wallet` chip beside the amber Confirm button (only spot two ambers co-exist; chip non-interactive so within R1) | `deal-actions.tsx:140-142` | low | Optional |
| M5 | Decorative `text-flame` bolt icon as a feature accent on upgrade page | `plan/upgrade/page.tsx:26` | low | Optional |

---

## 3. Admin

**Routes/screens (code):** `/admin` (approval queue), `/admin/merchants` (+ `[id]`
+ `merchant-admin-actions.tsx`), `/admin/deals` (+ `moderation-actions.tsx`),
`/admin/redemptions` (fraud queue + `fraud-actions.tsx`), `/admin/billing` (+
`plan-actions.tsx`), `/admin/agents`, `/admin/reports`, `/admin/support` (+
`override-button.tsx`); shell `admin/layout.tsx` + `admin-sidebar.tsx`. API:
`api/admin/merchants/[id]/{approve,ops}`, `fraud/[id]`, `deals/[id]`, `plans/[id]`,
`support/[id]`.

**Auth gating:** API routes are **uniformly admin-gated** (`requireAdminApi()`;
`approve` open-codes an equivalent check). **Pages have no own gate** — they rely
solely on the layout's `requireAdminPage()` (`admin/layout.tsx:12`) while querying
with the **RLS-bypassing service client**. In App Router a layout `redirect()` is
not a hard barrier around a child's data fetch → **defense-in-depth gap**.

**Locked-rule verdicts:** tokens/no-hex/no-gradient PASS · R4 PASS · R5 PASS ·
**money typography PARTIAL** (uncoloured ✓ but **not `.tnum`/`.font-code`** on KPI +
redemption amounts; wallet balances rendered inside `text-muted`, the non-money
token) · **R1 at risk** (per-row amber CTAs + amber active filter pills can put >1
amber on one screen).

**Issues:**
| # | Issue | File | Sev | Low-risk fix? |
|---|---|---|---|---|
| A1 | Admin **pages carry no own role gate**; depend on layout + query via service client (RLS bypass) | all `admin/*/page.tsx` | **med** | Yes — add `await requireAdminPage()` at top of each page (`lib/admin.ts:6`) |
| A2 | No customer/`users` list or detail (spec asks for a user list; only merchants listable) | — | med | No (feature) |
| A3 | No `/admin/redemptions/[id]` detail; release/reject only at fraud-event grain; "All redemptions" list read-only | `redemptions/page.tsx:106-120` | med | No (new route) |
| A4 | Money not mono/tabular on admin surfaces | `cards.tsx:307,343`, `reports/page.tsx:96` | low | Yes |
| A5 | Money shown in `muted` (non-money token) — wallet balances | `merchants/page.tsx:44`, `merchants/[id]/page.tsx:39` | low | Yes |
| A6 | >1 amber per screen: row CTA + active filter pill | `fraud-actions.tsx:25`+`redemptions/page.tsx:65`; `plan-actions.tsx:55`+`billing/page.tsx:60` | low–med | Partial (de-amber filter pills) |
| A7 | Gate-pattern inconsistency: `approve` uses inline `ensureAppUser` vs `requireAdminApi` elsewhere | `approve/route.ts:9-15` | low | Yes |
| A8 | Deal "Keep" is client-only, records nothing server-side | `moderation-actions.tsx:20-22` | low | No |
| A9 | Solid-fill flame chips vs token intent (text+border); deals page duplicates `FraudChip` inline | `deals/page.tsx:92`, `chips.tsx:251` | low | Yes |

---

## 4. Agent

**Routes/screens (code):** `/agent` (console: weekly target, KPIs, recent leads,
"+ New lead"), `/agent/leads` (my leads + lock countdowns), `/agent/leads/new`
(lead capture — "locks for 48h"); assists the merchant `onboard-wizard.tsx`. API:
`api/leads`, `api/merchants/onboard`. **No `/agent/layout.tsx`** — each screen
hand-rolls its own back link.

**Gating:** `/agent` and `/agent/leads` gate server-side (`role` in {agent,admin});
`api/leads` gates on role + active-agent. **`/agent/leads/new` has no page-level
gate** (client page; only the API rejects writes).

**Onboarding wizard steps:** intro → business → **location (w3w validation gate:
Continue `disabled={!resolved}`, cleared on edit — correct)** → floor → wallet
(success-fee disclosure) → review → done. Copy/tokens/shared-components clean; no
invented product vocab; no raw hex; error bodies `text-ink`.

**Issues:**
| # | Issue | File | Sev | Low-risk fix? |
|---|---|---|---|---|
| G1 | ✅ **CLOSED 2026-07-23.** Agent-assisted onboarding attribution is now wired end-to-end: the onboard wizard asks "Were you helped by a Maanta agent?" + an agent picker, the route forwards the selected `agents.id` as `p_onboarding_agent_id`, and `onboard_merchant` (migration `20260702085628`) records `agent_assisted` + `assisted_by_agent_id`, validated against an active agent. **Trust model:** the route authenticates the merchant (`ensureAppUser`) and runs the RPC via the **service client** with `p_user_id = appUser.id` — a merchant can only onboard themselves, never another user. Service client is required because `onboard_merchant` promotes the user's role and the `prevent_self_role_escalation` trigger only permits that for `service_role`/`admin` (a user-session call would 403); this mirrors the fee-reversal route. The agent is attribution only, never the caller. Tests: `supabase/tests/onboard_agent_attribution_test.sql`, `api/merchants/onboard/__tests__/route.test.ts` | `api/merchants/onboard/route.ts` | ~~high~~ done | — |
| G2 | `/agent/leads/new` has no page-level role gate (write blocked server-side only) | `agent/leads/new/page.tsx` | med | Yes (gate the page) |
| G3 | `entranceNotes` captured in wizard but dropped (`p_entrance_notes: null`) | `onboard-wizard.tsx` / `onboard/route.ts:47` | low | Yes |
| G4 | Captured lead (`leads.agent_id`) is never FK-linked to the resulting merchant; agent credit relies on later `onboarded_by` at activation | — | low–med | No (data model) |
| G5 | No agent layout/shared nav; each screen re-implements back-nav; amber progress-bar co-exists with amber CTA on `/agent` | `agent/page.tsx:76,88` | low | Optional |

---

## Update — 2026-07-22: quick low-risk polish pass (branch `claude/maanta-ui-polish-0sricr`)

A dedicated polish session addressed the "quick, low-risk" bucket below. **UI/UX
only — no money-path logic, pricing, SQL, or migrations were touched.** Verified
with `npm run typecheck`, `npm run lint`, `npm test` (40/40, incl. `pricing` +
`frozen-ui-rules`), and `npm run build` (all green). The pgTAP money-path suite
(`supabase/tests/*.sql`) was **not modified** and remains green in CI.

**Addressed:**

- **S1** — feed tiles now render the one-line "Includes KES N in taxes and
  charges" summary under YOU PAY (both `DealCardVertical` and
  `DealCardHorizontal`), using `text-secondary` (money-context token, not
  `muted`). Display-only; `dealPricing().extras` from the single `lib/pricing.ts`
  source — YOU PAY math untouched.
- **S2** — `/select-mall` now has an ink (never amber) back affordance:
  `router.back()` with a `/feed` fallback so a shopper landing there isn't
  stranded (the page sits outside `(shopper)/` and has no tab bar).
- **S3** — claim error now uses the shared `InlineAlert variant="error"` (flame),
  replacing the hand-rolled `rust` (warning-token) alert.
- **S5** — the boosted rail heading is renamed "Priority Placements" → **"Boosted
  Deals"** to match the chip/param/DB vocabulary.
- **M3** — codes use the dedicated `.font-code` utility (slashed-zero, tabular)
  instead of `font-mono`: wallet transaction detail (code + provider ref), the
  OTP entry cells (`OtpCells`, merchant redeem), the admin fraud-event code, and
  the landing hero's sample code. (w3w `font-mono` on `W3wChip`/address inputs is
  intentional and left as-is.)
- **A4/A5** — admin money is tabular (`tnum`) and ink: `KpiCard` value +
  `RedemptionRow` amount (shared), and merchant wallet balances on
  `admin/merchants` + `admin/merchants/[id]` moved off the `muted` non-money token.
- **A6** — active admin filter/range pills de-ambered to neutral ink
  (`bg-ink text-white`) on `redemptions`, `billing`, `deals`, `reports`, so amber
  stays reserved for the one primary/row action per screen (R1).
- **A7** — `merchants/[id]/approve` now uses the shared `requireAdminApi()` gate
  (identical 401/403), instead of open-coding `ensureAppUser`.
- **A9** — `FraudChip` restyled to the token-intended text+border error tone
  (dropping solid fills incl. the amber `velocity` fill); `admin/deals` now reuses
  `FraudChip` instead of a hand-rolled solid-flame span.
- **G2** — `/agent/leads/new` gained a page-level role gate mirroring the sibling
  agent pages (form extracted to `new-lead-form.tsx`, page is now a gated server
  component). Write was already API-gated; this is defense-in-depth parity.
- **G3** — the onboarding wizard's captured `entranceNotes` is now carried to
  `onboard_merchant` (the RPC already had the `p_entrance_notes` param) instead of
  being dropped as `null`.

**Intentionally deferred to feature-build sessions** (unchanged): A8 (deal
"Keep" persistence), plus optional cosmetics S4/S6/S7, M2/M4/M5, G5. (G1 agent
attribution closed 2026-07-23; A2/A3/G4 closed 2026-07-22.)

## Prioritized backlog (what to fix next)

**Should fix before real traffic**
- **A1** — add `requireAdminPage()` to each admin page (defense-in-depth; one line/page, helper exists).
- ✅ **G1** — agent-assisted onboarding attribution shipped 2026-07-23 (wizard question + picker → route → `assisted_by_agent_id`; merchant stays the submitter).
- **M1** — zero-balance publish needs an actionable top-up CTA (not just prose).

**Quick, low-risk polish (copy/token/class)**
- S1 (tile extras line), S2/S6 (`/select-mall` + leaf back-nav), S3 (rust→flame token), S5 ("Boosted" naming), M3 (`.font-code` on codes), A4/A5 (mono + ink for admin money), A6 (de-amber filter pills), A7 (gate helper consistency), A9 (reuse `FraudChip`), G2 (gate `/agent/leads/new`), G3 (wire `entranceNotes`).

**Feature gaps (own tickets)**
- ✅ **A2** (admin customer list), **A3** (admin redemption detail), **G4** (lead↔merchant
  link) — implemented 2026-07-22, see `docs/skills/ui-feature-gaps-closed.md`.
- A8 (deal "Keep" persistence) — still open.

## Notes
- No FAIL-level Locked-Rule violations were found in any role; findings are
  defense-in-depth, feature-gap, and low-severity polish.
- The frozen money/colour/vocabulary/S5 invariants hold — confirmed live for
  shopper, by code for the rest.
- Walkthrough seed data was created and then deleted; the live DB is back to
  0 merchants/deals/redemptions with the 2 real users intact.
- Follow-up for real interaction coverage: Playwright + Clerk test-mode golden
  path (`/demo → claim → verify → wallet`), already tracked.
