# Claude Design — wireframe reality-sync prompt (2026-07-30)

**Created:** 2026-07-30 · **Mode:** Reviewer → Builder · **Status:** durable handoff.

This file supersedes `docs/skills/wireframes-update-prompt-2026-07-24.md` as the
current paste-ready prompt for Claude Design. It is grounded in repo state at
`c9b6de4` (HEAD == `origin/main`), read directly — not from prior summaries.

The prompt is self-contained: paste everything inside the fenced block.

---

## A. Verified reality summary

### Provenance

- `HEAD` = `origin/main` = `c9b6de4` (merge of PR #140). **Nothing is sitting
  unmerged.** Everything below labelled "in repo" is on `main`.
- 81 files in `maanta-app/supabase/migrations/`.
- There is **no `maanta-app/design/current-reality/` directory**, and no
  `frames.json`. The design artifacts that exist are:
  - `maanta-app/design/Maanta_Wireframe_System.pdf` (screen-ID source, e.g. `11b`, `11j`, `12e`)
  - `maanta-app/design/claim-and-till/` — HTML canvas + `support.js` + logo assets,
    the repo-side mirror of the Claude Design file
    `MAANTA Mobile Wireframes - Claim and Till.dc.html`
    (project `be022a3c-9a0a-4269-8c6d-6095c3114e4d`). It covers **only** the
    claim + till screens (`8g`–`8ae`, `9k`–`9m`), not the public or admin sets.
  - `docs/skills/truth-audit-2026-07-30.md` §0 explicitly records that the
    `frames.json` / `R-xxxx` / `D-xx` mirror assumed by earlier prompts **does
    not exist in this repo**.

### Merchant / public experience — verified in code

| Surface | Verified reality |
|---|---|
| `/` landing | Hero "Claim in-mall deals before you pay." One primary CTA **Browse live deals** → `/feed`; quiet text link **Install the app** → `/download`. Trust pill "Live at BBS Mall, Eastleigh · Nairobi". 3-step "How Maanta works" = Discover / Claim / Redeem. Merchant door section "Run a shop at BBS Mall?" → CTA **List your shop** → `/for-merchants`. "Built for Nairobi malls first" names **Node 0** and says "No online checkout." Waitlist section = shopper / merchant / mall operator. |
| Merchant handoff | Two hops, not one: `/for-merchants` (the sell, screen `12d`) → CTA **`/merchants`** (lead-gen form, `12m`: shop name + phone) → `/login?next=/merchant/onboard?shop=…` → onboarding wizard. `/merchants` footer: "Or ask a Maanta agent at BBS Mall to sign you up in person." |
| `/pricing` (`12e`) | Standard headline = **"No monthly fee"** — the word "Free" is banned as a plan price and guarded by `pricing-copy.test.ts`. Elite = **KES 3,500/mo**. Launch-offer pill: "the first 100 BBS Mall merchants get a 30-day Elite trial", with the caveat line: fee still applies during trial, 30 days → 7-day grace → stays on Standard unless converted. |
| Fee constant | Single-sourced as `SUCCESS_FEE_KES` in `src/lib/pricing.ts`; `/pricing`, `/for-merchants` (incl. its metadata) and `data.ts` all import it. Duplicating it fails a test. |
| Opening credit | `/for-merchants` only: `OPENING_CREDIT = 300`, `OPENING_CREDIT_CAP = 100`, worked as "**10** verified redemptions before you top up". Granted by `activate_merchant` **at activation, not signup**, and only inside `node0_launch_period_ends_at`. |
| Counter workflow copy | `/for-merchants` 4 steps: Post a deal → A shopper claims it → **Verify at your counter** → Pay KES 30 (only on a verified code; expired/rejected cost nothing). Plus "A code always verifies" — arrears settle from the next top-up, customer is never held up. |
| `/malls/bbs-mall` (`12k`) | Live shop/deal counts by floor, computed through the canonical public-visibility predicate, demo rows excluded unless demo mode is on. |

### Admin / ops experience — verified in code

| Surface | Verified reality |
|---|---|
| Pending merchant detail (`11b`) | `src/app/admin/merchants/[id]/page.tsx`. Renders: name + `StatusChip` + `PlanChip(tier)`, contact, floor/unit · wallet · trust, a w3w-resolved row with entrance notes, then actions + location form. **It selects `elite_trial_active` and `trial_ends_at` but never renders them** — there is no trial state on this screen today. |
| Approve flow (`11j`) | `merchant-admin-actions.tsx`. When `status === "pending"`: **Approve**, **Reject**, and a `Grant Elite trial (30 days)` checkbox — the checkbox appears **twice**, once inline and once inside the modal, bound to the same state. Modal copy: "Approve {name}?" / "The shop goes live at {node} immediately and the owner is notified by SMS." + w3w chip + floor/unit + checkbox + **Confirm approval** / **Cancel**. |
| **Skip notice** | **Exists in the API, not in the UI.** `POST /api/admin/merchants/[id]/approve` returns `eliteTrialOutcome: "granted" \| "skipped_cap_reached" \| "unknown"` plus a human `notice` string. The client **discards the success body entirely** — it closes the modal and calls `router.refresh()`. Error text renders only on `!res.ok`. So an admin who ticks the box against an exhausted cap is told nothing. |
| Elite cap status | `elite_trial_cap_status()` returns `(cap, granted, remaining)`. Grep across `src/` finds **zero UI callers** — the function is ops/SQL-only. There is no cap surface in the admin UI. |
| Grant Elite trial, direct | `POST /api/admin/plans/[id]` action `grant-trial`. On cap exhaustion the trigger raises and the route returns **409** with a specific message pointing at "Mark paid" or raising `app_config.elite_trial_merchant_cap`. `plan-actions.tsx` **does** render this (`setError` → visible span) — so unlike the approve path, this one is honestly surfaced. |
| Billing (`11f`) | `/admin/billing` "Plans & trials": search + filters `all / elite / trial / standard`, rows showing `Elite trial · N days left` or Elite/Standard, with per-row plan actions. Limit 100, churned excluded. |
| Audit / retention | `admin_ops_log` is written on approve and on plan actions. Migration `20260730150000_demo_wipe_audit_trail_retention.sql` makes the demo wipe stop deleting a **real** merchant's guardian/fraud/ops trail when a **synthetic account was the actor**. It is entirely back-end — **no UI surface**. |
| Demo banner scope | `DemoModeBanner` is mounted in the `(public)`, `(shopper)` and `merchant/(app)` layouts. It is **not** in `admin/layout.tsx` or `agent/layout.tsx`. |

### Product logic the wireframes must not misrepresent

- **Elite trial cap is now real.** Migration `20260730130000` adds
  `merchants.elite_trial_granted_at` (durable, never cleared),
  `app_config.elite_trial_merchant_cap = 100`, and
  `trg_enforce_elite_trial_cap` on **INSERT and UPDATE**.
- **The two grant paths fail differently, on purpose.** `activate_merchant`
  checks first and, when the offer is spent, **activates the merchant on
  Standard with no trial and no error**. A direct admin grant **raises**
  `ELITE_TRIAL_CAP_REACHED` → 409. A wireframe that shows one behaviour for both
  is wrong.
- **30-day trial is frozen.** The old wireframe `11j` "14 days" was ruled stale
  in the 2026-07-29 audit and the stale code comment was corrected on 2026-07-30.
- **KES 300 opening credit** is a *separate* promo from the Elite trial, with its
  own config keys, its own cap of 100, and — unlike the trial — an explicit
  **launch-window** check. It is granted at activation. It appears in public copy
  on `/for-merchants` only; there is **no merchant-app surface** announcing it.
- **Grace period is invisible in the UI.** `handle_trial_expiry()` sets
  `grace_period_ends_at = trial_ends_at + 7 days` and keeps `tier = 'elite'` and
  `elite_trial_active = TRUE` during grace. Both `/merchant/plan` and
  `/admin/billing` compute days from `trial_ends_at` and clamp at 0. **A merchant
  in grace therefore renders as "Elite trial · 0 days left"** — there is no grace
  badge, no grace copy, nothing. Grep for `grace_period_ends_at` in `src/` returns
  only `api/admin/plans/[id]/route.ts`, where it is cleared.
- **Demo mode is DB-driven**, `app_config.demo_mode_enabled`, read uncached and
  fail-safe to OFF. Banner text is fixed: "Demo mode — sample data for rehearsal.
  These shops, deals and codes are not real."
- **Shoppers never pay in-app.** Still true, still the single most important
  constraint. Landing copy says "No online checkout."

### Launch / pilot posture

| Status | Items |
|---|---|
| **Verified in code/repo, on `main`** | Everything in the tables above: cap enforcement, sentinel null-guard, demo-wipe retention, pricing copy corrections, locked feed order, single-sourced fee. |
| **Merged but NOT confirmed applied to production** | `20260730120000` (config notes), `20260730130000` (**cap enforcement**), `20260730140000` (sentinel guard), `20260730150000` (wipe retention). `docs/ops/supabase-migrations.md` states Claude Code does not run migrations — a **human operator** must push to `axrrslqssmbngbataejg`. FU-2 in the truth audit is still open. |
| **Live-state caveat with teeth** | The 2026-07-29 cron migration notes **~101 merchants already on an Elite trial in production**. The cap backfill counts every merchant with `elite_trial_active` or a non-null `trial_ends_at`. So on the day `20260730130000` is pushed, `elite_trial_cap_status()` may well report **0 remaining**, and every subsequent approval will silently go live on Standard. Operator must run `SELECT * FROM public.elite_trial_cap_status();` immediately after the push. |
| **Production posture, from the audit** | `app_config.demo_mode_enabled` is **`true` on production** (correct for rehearsal; its own notes say it must be false at launch). The paired `MAANTA_DEMO_MODE` Vercel var is unverified from the repo. |
| **Requires founder visual confirmation** | Whether Vercel production is actually serving `c9b6de4`; whether the four migrations have been pushed; the live value of `elite_trial_cap_status()`; whether `MAANTA_DEMO_MODE` matches the DB switch. |
| **Post-pilot / not today's reality** | Live Stripe keys (sandbox only), IntaSend M-Pesa STK (code path exists, credentials not assumed), published legal policies (drafts only), mall-operator analytics dashboard (deferred), multi-mall expansion, subscription billing wired to a processor (KES 3,500 is hardcoded — FU-4). |

---

## B. Paste-ready Claude Design prompt

```
You are Claude Design, updating an EXISTING MAANTA wireframe set so it matches
how the product actually behaves right now. This is a reconciliation pass, not a
redesign. Preserve the existing visual language, grid, component vocabulary and
flow structure wherever they are still correct. Change structure, states, labels
and copy only where reality has moved.

MAANTA is an in-mall deals platform piloting at BBS Mall, Eastleigh, Nairobi
("Node 0"). Shoppers claim a deal in the app and get a 6-digit code, walk to the
merchant's counter, and pay the merchant DIRECTLY IN CASH at the deal price.
Merchants pay MAANTA a flat KES 30 success fee per VERIFIED redemption from a
prepaid wallet. Admins approve merchants and handle disputes. Currency is KES.

## Source-of-truth hierarchy (apply in this order)

1. Application code and database migrations — authoritative for how the product
   BEHAVES. If this prompt and your memory of an older wireframe disagree, the
   behaviour described here wins.
2. Notion — authoritative for business rules and operating decisions.
3. This prompt — a verified snapshot of (1) as of 2026-07-30.
4. Existing wireframes — authoritative ONLY for visual language and component
   vocabulary. They are NOT authoritative for behaviour, copy, or state coverage.

Anything you cannot ground in 1–3 does not go in the wireframes.

## The two truths that must never be violated

1. MAANTA NEVER charges a shopper in-app. No checkout, no cart, no card entry,
   no "pay now" on any shopper screen. Shopper payment is cash, in person,
   after staff verify the code. (Merchants DO pay in-app — wallet top-ups —
   that is a different audience.) The landing page says "No online checkout";
   keep it that way everywhere.
2. Do not show a public-launch state as today's default. The product is in
   PILOT at one mall with rehearsal data switched on. Where a screen would look
   different at public launch, wireframe the PILOT state and label the launch
   state as a variant.

## Screen groups to audit and update

### GROUP 1 — Public / merchant acquisition

- Landing (`/`): hero "Claim in-mall deals before you pay." with ONE primary CTA
  "Browse live deals". "Install the app" is a quiet text link, not a second
  button. A trust pill reads "Live at BBS Mall, Eastleigh · Nairobi". A 3-step
  explainer: Discover → Claim → Redeem. A dedicated merchant-door section titled
  "Run a shop at BBS Mall?" whose CTA is "List your shop". A closing waitlist
  section offering THREE distinct audiences: shopper, merchant, mall operator.
- Merchant handoff is TWO hops, not one. Wireframe both:
  (a) the sell page — fee model, counter workflow, plan comparison; its CTA goes
      to (b);
  (b) a short lead-gen signup form — shop name + phone only — which routes to
      login and then into the onboarding wizard. Its footer offers an in-person
      alternative: "Or ask a Maanta agent at BBS Mall to sign you up in person."
  Do not collapse these into a single page.
- Pricing: TWO plans.
    Standard — headline price reads "No monthly fee". NEVER the word "Free" as a
    plan price: Standard merchants still pay the success fee, so "Free" is a
    banned framing. Sub-line: 1 standard deal + KES 30 per verified redemption.
    Elite — KES 3,500/mo + KES 30/redemption, 2 active deals, flash deals, boosts.
  Below them, the launch offer, stated with ALL THREE qualifications and none
  dropped: "the first 100 BBS Mall merchants get a 30-day Elite trial", plus a
  caveat line that the KES 30 fee STILL APPLIES during the trial, and that after
  30 days there is a 7-day grace period, then the account stays on Standard
  unless the merchant converts. An unqualified "first month of Elite free" is
  exactly the stale copy this pass exists to remove.
- Counter-workflow explainer on the merchant sell page — four steps: Post a deal
  → A shopper claims it (nothing has cost you anything yet) → Verify at your
  counter → Pay KES 30, only on a verified code; expired and rejected codes cost
  nothing. Plus a reassurance block: a code ALWAYS verifies even on an empty
  wallet; the unfunded fee becomes arrears settled from the next top-up, and the
  customer at the counter is never held up.
- Opening credit is a SEPARATE promo from the Elite trial. On the merchant sell
  page only: KES 300 opening credit, first 100 merchants, granted at ACTIVATION
  (not at signup), inside the launch window — worked as "covers 10 verified
  redemptions before you top up". Do NOT merge it with the Elite trial offer,
  and do NOT invent an opening-credit surface inside the merchant app; none
  exists today.
- Featured-mall page: live shop and deal counts broken down by floor.

### GROUP 2 — Admin / ops (pilot day)

- Pending merchant detail. Today it shows: shop name + status chip + plan chip,
  contact line, floor/unit · wallet balance · trust score, a "w3w resolved" row
  with the what3words address and entrance notes, then the actions row and a
  location-edit form. NOTE: trial state (active / days left) is NOT displayed on
  this screen today. Wireframe it as it is, and mark "trial state on merchant
  detail" as a drift candidate rather than silently adding it.
- Approve flow. A pending merchant offers: Approve, Reject, and a checkbox
  "Grant Elite trial (30 days)". Confirmation modal: "Approve {shop}?" / "The
  shop goes live at {mall} immediately and the owner is notified by SMS." + the
  what3words chip + floor/unit + the same checkbox + "Confirm approval" /
  "Cancel". The label says 30 days — NOT 14. Any "14-day trial" in the existing
  wireframes is stale and must be removed.
- Elite trial cap. The 30-day trial is now capped in the DATABASE at the first
  100 merchants at the launch node. A consumed slot is never recycled — ending
  or converting a trial does not free it. The two grant paths behave DIFFERENTLY
  and the wireframes must show both:
    (a) Approving a merchant with the trial box ticked when the offer is spent →
        the merchant is STILL APPROVED, on Standard, with NO error. A promo
        running out must never block a shop going live.
    (b) Granting a trial directly from the plans/billing screen when the offer is
        spent → a hard REFUSAL with an explanatory message pointing the admin at
        "Mark paid" instead, or at raising the cap.
  Wireframe (b)'s refusal message as a real, currently-rendered state.
- Skip notice — READ THIS CAREFULLY. The approve API already returns a notice
  ("Shop approved on Standard — the 30-day Elite trial launch offer is fully
  claimed") and a separate one for the case where the outcome could not be
  confirmed. The ADMIN UI DOES NOT RENDER EITHER — it just closes the modal and
  refreshes. So: wireframe the CURRENT state (silent close, no notice) as
  today's reality, AND wireframe the intended post-confirmation notice as a
  clearly-labelled "not yet built" variant. Do not present the notice as
  something the admin sees today.
- Cap status surface. A `cap / granted / remaining` readout exists in the
  database but has NO admin UI at all. Do not draw a cap counter as if it
  shipped. If you propose one, put it in the drift report under "okay after
  pilot", not into the current-state frames.
- Plans & trials (billing) list — the screen that matters on pilot day: a search
  field, filter pills (all / elite / trial / standard), and rows showing the shop
  name with either "Elite trial · N days left" or Elite / Standard, plus per-row
  plan actions (grant trial / mark paid / downgrade). Inline error text renders
  on this screen when an action is refused.
- Audit / retention has NO admin UI. Admin actions are written to an ops log
  server-side; retention rules for rehearsal-data wipes are entirely back-end.
  Do not invent an audit-log viewer, a retention settings panel, or a wipe
  console.

### GROUP 3 — Trial lifecycle states (highest drift risk)

- 30-day trial → 7-day grace → auto-downgrade to Standard is the frozen rule and
  runs as a nightly job.
- BUT the grace period has NO UI TODAY. During grace the merchant is still on
  Elite with the trial flagged active and the end date in the past, so both the
  merchant's plan screen and the admin billing list render it as
  "Elite trial · 0 days left". That misleading state is the CURRENT TRUTH.
  Wireframe it exactly, annotate it as a known gap, and put a proper grace
  state ("Grace period · N days to convert") in the drift report as a proposal —
  not in the current-state frames.
- Merchant plan screen today: a plan card (Elite or Standard) with entitlements,
  an amber "Elite trial · N days left" pill when on trial, an "Upgrade to Elite —
  KES 3,500/mo" CTA when on Standard, and links to a success-fee explainer and
  transaction history. No grace copy, no conversion countdown, no payment
  processor — subscription billing is not wired to a processor yet, so do not
  wireframe an Elite checkout.

### GROUP 4 — Demo / pilot posture

- Demo mode is a DATABASE switch, currently ON for rehearsal. When on, a loud
  disclosure banner appears above public, shopper and merchant screens with the
  exact text: "Demo mode — sample data for rehearsal. These shops, deals and
  codes are not real."
- The banner is NOT shown on admin or agent screens. Do not add it there.
- Every shopper, merchant and public frame you produce should exist in two
  variants: demo-on (banner) and demo-off (no banner, no residue). The banner
  renders nothing when off — there is no launch-mode footprint.
- The pilot is a REAL merchant at BBS Mall with a durable Elite trial slot, on a
  database that also holds rehearsal rows. Do not wireframe the pilot as a demo,
  and do not wireframe it as a public launch.

## Reality tiers — label every frame with exactly one

- LIVE NOW — in the code and rendered to users today.
- MERGED, NOT YET CONFIRMED IN PRODUCTION — in the codebase and on main, but the
  database changes behind it require a manual operator push that has not been
  confirmed. This covers the trial-cap enforcement, the trial-expiry sentinel
  fix, and the rehearsal-wipe retention change. Draw these as current behaviour
  but carry the label.
- POST-PILOT / FUTURE — not today's reality. Includes: live card payments
  (sandbox only today), M-Pesa STK (code path exists, availability not assumed),
  published legal policies (drafts only), mall-operator analytics, multi-mall
  expansion, and any Elite subscription checkout.

## Do not drift

- No speculative redesign. No new navigation, no re-ordered flows, no renamed
  primitives, no component library swap.
- No fake premium polish. Low-fidelity: boxes, labels, states, copy. No imagery,
  no gradients-as-decoration, no celebration moments. Money moving is not a party.
- No stale prototype copy. Specifically remove on sight: "14-day trial", "first
  month of Elite free", "Free" as a plan price, any unqualified Elite-trial
  promise missing the 100-merchant cap / BBS-Mall scope / fee-still-applies
  caveat, and any shopper-side payment, cart or checkout element.
- No public-launch-only state shown as today's default — demo mode is ON, the
  pilot is one mall, and card/M-Pesa rails are not live.
- Do not invent surfaces for back-end-only behaviour: no cap counter, no audit
  viewer, no retention console, no FX or currency picker, no grace-period screen
  in the current-state set.
- Keep the three merchant money figures distinct and never conflated: the cash to
  collect from the shopper, the KES 30 success fee, and the wallet balance.
- Where an amount can be missing or zero, show the omitted state — no empty
  "KES 0" rows.

## Deliverables — return all three

1. UPDATED WIREFRAMES for every screen group above, each frame tagged with its
   reality tier (LIVE NOW / MERGED, NOT YET CONFIRMED / POST-PILOT).
2. A SCREEN-BY-SCREEN SYNC LOG: one row per screen — screen name, what changed,
   why (which behaviour it now matches), and whether the change is structure,
   state coverage, or copy. Screens you inspected and left unchanged get a row
   too, marked "no change".
3. A DRIFT REPORT in exactly three buckets:
   - MUST SYNC NOW — wireframes that currently misrepresent live behaviour and
     would mislead someone preparing for pilot day.
   - OKAY AFTER PILOT — real gaps that are safe to carry through the pilot
     (e.g. the missing approve-modal skip notice, no cap-status surface, no trial
     state on merchant detail).
   - FUTURE POLISH ONLY — cosmetic or nice-to-have, explicitly not blocking.
   For each drift item, state the evidence and the consequence of leaving it.

## The test this work has to pass

Someone who looks ONLY at the updated wireframes should come away understanding
how MAANTA actually behaves today — for the immediate BBS Mall pilot and the
current state of the app — without being misled by stale prototype assumptions,
and without mistaking a planned surface for a shipped one.
```

---

## C. Assumptions that could not be verified from the repo

1. **Whether the four 2026-07-30 migrations are applied to production.** Repo
   policy forbids Claude Code from running migrations, and the truth audit's FU-2
   is still open. Treated as *merged, not confirmed deployed*. Requires founder /
   operator confirmation via `supabase migration list`.
2. **Whether Vercel production is serving `c9b6de4`.** No deployment metadata in
   the repo. Requires founder visual confirmation.
3. **Live value of `elite_trial_cap_status()`.** The ~101-merchants-on-trial
   figure comes from a migration comment dated 2026-07-29, not a live read. If
   accurate, the cap is already exhausted at push time. This is why the prompt
   makes the "approved on Standard, silently" path a first-class wireframe state
   rather than an edge case.
4. **`MAANTA_DEMO_MODE` (Vercel env) vs `app_config.demo_mode_enabled` (DB).**
   Only the DB switch is readable from the repo, and only its value as recorded
   in the 2026-07-30 audit. The two can drift; the env var only tags analytics.
5. **The Claude Design file's current contents.** `design/claim-and-till/` mirrors
   only the claim + till screens. The public, admin and trial-lifecycle frames the
   prompt asks Claude Design to audit are assumed to exist in the Claude Design
   project; if they do not, those groups become net-new frames rather than updates.
6. **Whether a real pilot merchant row exists in production with a durable Elite
   trial slot.** The pilot posture is described in docs; the specific merchant is
   not identifiable from the repo.
7. **SMS notification on approval.** The approve modal promises "the owner is
   notified by SMS". The dispatch path was not traced in this pass — the copy is
   reported as-rendered, not as verified end-to-end.
