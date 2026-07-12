# MAANTA — State-of-Play Audit (2026-07-12)

Grounded audit of the actual repository, live Supabase project, and CI state —
not an inference from chat history. Every claim below was checked against the
repo, the migrations applied to the live database, and a full local
`typecheck → test → build` run.

**Headline:** MAANTA is not a doc-heavy pre-build mess. It is a working,
CI-green, deployed full-stack app. The founder's mental model (scattered PDFs,
"docs ≠ product", no canonical repo) is ~2 months behind the actual code. The
bottleneck is last-mile launch operations, not implementation.

---

## A. Current-state diagnosis

MAANTA has a **single canonical monorepo** (`maanta-app/maanta`, default branch
`main`) containing a Next.js 14 (App Router, TypeScript) + Supabase application
with 97 `.tsx` files, 51 `.ts` libs/routes, and 36 SQL migrations. It builds
clean (76 routes, exit 0), passes typecheck, and passes 17 vitest tests, all
enforced in GitHub Actions CI (lint → typecheck → test → build) on every PR.

The backend is **live, not conceptual**: Supabase project `vcrfqsevompqjazbwzyh`
(eu-west-1, ACTIVE_HEALTHY, created 2026-06-18) has **all 36 migrations
applied** — the live DB is in sync with the repo. Money-touching logic
(`claim_deal`, `verify_redemption`, fee debit / arrears, ledger writes) lives in
atomic Postgres RPCs, hardened with pinned `search_path`, revoked anon execute,
and self-role-escalation blocks.

The design system is **implemented as code**, not trapped in a PDF: brand tokens
(brand yellow `#FDBF2D`, ink, cream, flame, verified green, etc.), radii,
shadows, and a mobile `max-w` are all in `tailwind.config.ts`, sampled from the
one wireframe PDF. All shopper/merchant/admin/agent/public screens were built and
merged (PR #11).

What is genuinely *not built* is a short, specific list: public waitlist capture,
live payment credentials (M-Pesa/IntaSend), production env verification on the
deploy target, on-device QA, and lawyer-reviewed legal/incorporation. These are
operational last-mile items, not missing product layers.

---

## B. What probably exists right now → what actually exists

| Layer | Reality |
|---|---|
| **Specs/docs** | Solid and *current*. 26 markdown docs incl. a launch-readiness tracker (updated 2026-07-10 with per-flow status), technical handoff, decisions log, ops runbook, node-0 rehearsal checklist, email sequences. Honest about what doesn't exist. |
| **Brand/design system** | Implemented as Tailwind tokens + a component library (`src/components/ui/*`: button, cards, chips, inputs, overlays, states, icons). One source PDF, tokens sampled from it. Single frozen light theme by design. |
| **Reviewed screens** | Built AND shipped as code. Shopper (feed, deal detail, claim flow, tickets, my-deals, search, shop, profile), merchant (onboard, dashboard, deals + new-deal wizard, redeem keypad, wallet/topup, plan, staff, alerts), admin (merchants, deals moderation, redemptions/fraud, billing, support override, reports), agent (leads), public marketing pages. Merged via PR #11. |
| **Prototype/code** | This is the strong point. ~9,100 lines of TSX, thin API routes over atomic RPCs, Stripe + IntaSend + web-push libs, currency/FX, what3words geofencing. Vitest covers ledger, currency, and the Stripe webhook. |
| **Tools/workflow** | Git + GitHub + CI + live Supabase + Vercel (target) + Notion (ops SoT). MCP connectors available for Supabase, Vercel, Figma, Lovable, Replit, Resend, PostHog, Notion, Gmail — but the code workflow is already consolidated in the repo. |
| **Deployment readiness** | Backend deployed (Supabase live, migrated). Frontend: no `vercel.json`, deploy target named but production env vars **not yet set** (tracker E10), trial-expiry cron **not yet confirmed in prod** (E11). Not deployed to a verified production URL yet. |

---

## C. What is likely missing or fragile (direct)

1. **Public waitlist: does not exist.** No table, form, or API. Decided
   2026-07-10 to live in an external email platform (TBC). Gates the *campaign*,
   not the app — but nothing is built. (Tracker E7/E8, M1–M3.)
2. **M-Pesa / IntaSend: blocked on credentials.** Code + webhook exist; the STK
   push is untestable until IntaSend grants API access. This is the one payment
   rail Kenyan shoppers/merchants actually expect. (E6 — the only 🔴 in the
   product column.)
3. **Production deploy is unverified.** Env vars not set on Vercel (E10),
   `STRIPE_ENV` live-guard untested on deploy, `handle_trial_expiry` schedule
   unconfirmed in prod (E11). The app has never been proven to run against real
   production config.
4. **No on-device QA.** E2–E4 (shopper/merchant/admin journeys on real devices)
   are all 🟡. Seed data exists (`node0_rehearsal_seed.sql`); the human pass
   hasn't happened.
5. **Legal is draft-only and blocked.** `legal/*.md` are unreviewed, entity
   placeholders unfilled, blocked on incorporation (Nov Nairobi trip). Must not
   be linked from the live app. (O5.)
6. **Cross-border data risk unresolved.** Supabase in eu-west-1 vs. Kenya DPA
   2019 — no lawful-transfer basis decided. (O6.)
7. **FX provider is keyless/free** (open.er-api.com) — fine for KES-only launch,
   must be replaced before live non-KES charges. (E9.)
8. **Live DB security lints (minor):** two tables with RLS enabled but no policy
   (`organizations`, `payment_webhook_failures`), and a public `deal-images`
   bucket with a broad list policy. Low severity, worth a cleanup pass.
9. **Dependency hygiene:** `npm audit` reports 10 vulns (1 critical) in the tree;
   Next 14.2.35 is slightly behind. Not launch-blocking, but schedule it.

**What is NOT fragile / NOT missing** (don't waste leverage re-solving these):
canonical repo, design tokens, component library, core redemption loop, wallet
ledger, fraud/dispute routing, CI, migration history, docs currency.

---

## D. Biggest bottleneck

**Primary bottleneck: external dependencies and human verification, not code.**
The two hard blockers (IntaSend credentials, legal/incorporation) are things no
amount of building unblocks — they need a phone call and a November trip
respectively. The critical path to launch runs through *operations and
partners*, not the editor.

**Secondary bottleneck: the founder's mental model lags the repo.** Treating a
built product as if it's still a pile of specs causes real waste — re-planning
finished work, re-generating screens that already exist as code, and splitting
attention across Chat/Cowork/Lovable/Replit when the canonical build already
lives in one repo. The risk here is *AI-driven regeneration of things that are
done*, not under-building.

---

## E. Optimization work by priority (highest leverage first)

1. **Stop re-planning built work. Adopt the repo as the single source of truth
   for product behavior.** Read the tracker + technical-handoff before any new
   session. Highest leverage because it's free and prevents regeneration waste.
2. **Unblock IntaSend.** Weekly escalation isn't enough if it's the #1 payment
   rail. Chase credentials hard; in parallel, keep Paystack/Flutterwave as a
   named fallback (the comparison doc already exists) so this can't stall launch.
3. **Verify a real production deploy.** Set Vercel env vars, deploy, confirm the
   `STRIPE_ENV` guard, confirm `handle_trial_expiry` cron runs. One focused
   session converts "deployed backend" into "verified running app."
4. **Do the on-device QA pass (E2–E4).** Seed data is ready. This is the
   highest-value *human* task and can't be automated away.
5. **Build the waitlist path** (whatever the chosen platform) — it gates the
   marketing campaign, which needs a month of runway.
6. **Clean up the DB security lints + add RLS policies** to the two flagged
   tables and tighten the storage bucket policy.
7. **Legal + DPA**: schedule the lawyer *before* the November trip so the trip
   signs decisions rather than starting them.
8. **Dependency/security bump** (npm audit, Next minor) as a hygiene pass.

---

## F. This week vs. later

**This week (leverage, low external dependency)**
- Adopt repo-as-source-of-truth; stop regenerating finished screens.
- Escalate IntaSend credentials + confirm the fallback processor decision.
- Set production env vars and do one verified Vercel deploy.
- Fix the two RLS-no-policy tables and the storage bucket lint.

**Before first real build/launch attempt**
- On-device QA of shopper + merchant + admin journeys (E2–E4) using the seed.
- Confirm the trial-expiry cron actually runs in prod (E11).
- Decide KES-only launch (defers the FX-provider gate E9).

**Before merchants/shoppers touch the app**
- M-Pesa STK verified end-to-end (or the fallback rail live).
- Waitlist + landing pages live if you're running a pre-launch campaign.
- Merchant onboarding support process defined (O2) — who answers questions.
- Legal drafts at least reviewed enough to link a privacy policy.

**Later**
- Lawyer-final legal + incorporation (Nov trip).
- DPA cross-border resolution.
- FX SLA provider, self-serve Elite payment rail, deal drafts, extra malls,
  mall-operator reporting dashboard, dependency major bumps.

---

## G. Recommended operating model

- **Claude Code / IDE / Terminal → the build.** This is where product behavior
  changes. The repo + live Supabase + CI is already the canonical implementation
  loop. Everything that changes what the app *does* happens here and goes through
  a PR.
- **Canonical master spec → the repo, specifically the tracker + technical
  handoff.** `docs/maanta-launch-readiness-tracker.md` is the launch checklist;
  `docs/maanta-technical-handoff.md` is the "what actually exists" map;
  `docs/maanta-decisions-log.md` is the only place business rules change. Treat
  these three as the operating spec. The wireframe PDF is a *reference*, not a
  source of truth — the tokens in `tailwind.config.ts` are.
- **Notion → operations source of truth** (decisions, plans, ops), mirrored to
  `docs/`. Keep using it for non-code ops, but don't let it re-describe product
  behavior that the code already defines.
- **Chat → thinking, planning, one-off analysis** (like this audit). Not for
  producing artifacts that then live only in chat history.
- **Cowork → operator/marketing execution** (email sequences, campaign assets,
  agency brief) — the non-code deliverables.
- **Lovable / Replit / Figma Make → do NOT use for this product's app surface.**
  You already have a real Next.js app. Regenerating screens in a prototyping tool
  would fork the canonical build and create exactly the duplication the founder
  fears. Reserve them (if at all) for throwaway landing-page experiments that
  never merge back.

**What should stop happening:** treating docs as separate from the product;
regenerating finished screens; opening new "let's plan MAANTA" sessions that
re-derive settled decisions; spreading the app build across multiple builder
tools.

---

## H. Shortest path to launch readiness

If everything collapsed to the fewest high-value moves:

1. **One verified production deploy** (Vercel env vars set, app running against
   live Supabase, Stripe live-guard + trial cron confirmed).
2. **One payment rail Kenyans can actually use** — IntaSend M-Pesa unblocked, or
   the named fallback processor live. Don't launch on card-only.
3. **One human on-device pass** of browse → claim → redeem → fee debit, using the
   seed data already in the repo.
4. **KES-only launch decision** to defer the FX and multi-currency gates.
5. **A minimal privacy policy + waitlist** so you're legally and operationally
   allowed to put it in front of real people.

Everything else — more screens, more specs, more planning — is not on the
critical path. The product is built. Launch is now an operations problem.
