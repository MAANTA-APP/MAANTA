# Codebase for founders (plain language)

Last updated: 2026-07-26 · Audience: non-technical founder / operators

This is a plain-English map of what lives in the MAANTA repo — not an
engineering handoff. For product rules and launch status, see
`docs/maanta-project-overview.md` and `docs/maanta-launch-readiness-tracker.md`.

## The one-sentence version

The codebase is **one web app** that serves shoppers, merchants, on-ground
agents, and admins — plus a **database** that holds deals, wallets, and
redemption records, and enforces the money rules so they cannot be skipped
by a buggy screen.

## How to picture the system

Think of three layers:

1. **Screens people use** — the pages in the phone/browser (feed, claim,
   merchant keypad, admin review).
2. **The brain / filing cabinet** — Postgres (via Supabase): every deal,
   claim, OTP, wallet balance, and fee lives here.
3. **Payment rails** — Stripe (card top-ups) and IntaSend (M-Pesa STK).
   They move money in; MAANTA’s ledger records what happened to merchant
   wallets.

Auth (who is logged in) is handled by **Clerk**. The app does not invent
its own password system.

## Who uses which part of the app

| Who | What they do in the product | Where it lives in the app |
|---|---|---|
| Shopper | Browse mall deals, claim, show OTP at the till | Feed / deals / tickets |
| Merchant | Onboard, top up wallet, create deals, enter OTP to verify | `/merchant/*` |
| Agent | Lock merchant leads (48h), get credit when merchant onboarded | `/agent/*` |
| Admin | Approve merchants, review redemptions/disputes, reporting | `/admin/*` |
| Public | Marketing pages + waitlist | Public site routes |

Launch proving ground is **BBS Mall (Node 0)** — the feed is scoped to a
mall (“node”). Wrong mall cookie ⇒ empty feed, not a bug in deals data.

## The core money loop (what actually earns MAANTA money)

1. Merchant puts money in a **prepaid wallet**.
2. Merchant publishes a deal.
3. Shopper **claims** the deal → gets a short-lived **OTP ticket**.
4. At the counter, merchant **verifies** that OTP.
5. On successful verification, MAANTA debits **KES 30** (success fee) from
   the wallet — or records **arrears** if the wallet cannot cover it
   (**verify-anyway**: shopper still walks away redeemed; finance follows
   up later).
6. Merchants at **zero balance** cannot create new deals.

That claim → verify → fee path is the product’s spine. Everything else
(plans, boosts, trials, admin tools) supports or protects it.

## What “the code” is protecting (business rules baked in)

These are not just slide-deck rules; they are enforced in the database /
app logic:

- KES 30 success fee on verified redemption (all plans).
- Elite trial = 30 days, then 7-day grace, then auto-downgrade to Standard
  if unpaid.
- Verify-anyway + arrears rather than blocking the shopper at the till.
- Zero-balance gate on new deal creation.
- Role self-escalation blocked (a shopper cannot quietly become admin).
- Ledger entries for money movements are atomic and idempotent (same
  payment provider reference cannot double-credit a wallet).

If someone asks “can we change X?”, check `docs/maanta-decisions-log.md`
first — frozen rules need a new decision entry.

## What is *not* in this repo

- The live **waitlist / email automation** system (lives in the email
  platform; schema notes are documented separately).
- Draft legal docs are in the repo but are **not** lawyer-reviewed /
  published product terms yet.
- Notion remains the ops source of truth; `docs/` mirrors approved exports.

## How to “test like a founder” without reading code

Use separate accounts per role (admin / shopper / merchant). For
redemption, you need **two phones**: one shopper claim ticket, one merchant
keypad. See `docs/maanta-launch-ops-runbook.md`.

The automated safety net: unit tests in the app + SQL money-path tests
against a local database in CI. Those exist so engineers cannot break the
fee path silently.

## Where to dig next (when you need depth)

| Topic | Doc |
|---|---|
| Payments / wallet / FX | `docs/skills/payments-rails.md` |
| Redemption disputes | `docs/skills/redemption-disputes.md` |
| Auth (Clerk) | `docs/skills/clerk-auth.md` |
| BBS Mall seed / Node 0 | `docs/skills/node0-seed-bbs-mall.md` |
| Agent lead attribution | `docs/skills/agent-attribution.md` |
| UI roles walkthrough | `docs/skills/ui-walkthrough-roles.md` |

## Codebase quality (founder read)

**Verdict (as of 2026-07-26):** the repo is unusually disciplined for a
pre-launch money product — especially around fees, wallets, and abuse.
That is **not** the same as “ready to take live traffic.” The honest split
used in launch audits is:

- **Ready in repo** — implemented, tested, documented here.
- **Ready in prod** — applied and verified by a human on live Vercel /
  Supabase / Clerk / payment accounts. Many launch gates are still here.

### What is strong

| Signal | Why it matters to you |
|---|---|
| Money path is database-enforced | Claim → verify → KES 30 (or arrears) cannot be skipped by a broken button. SQL suites in CI assert double-verify cannot double-charge, low-balance → arrears, top-ups settle arrears first. |
| Security was re-audited and patched | Mid/late July work closed real abuse paths (e.g. clients writing wallet/status fields directly). Money RPCs locked down; rate limits; admin actions logged. |
| CI on every PR | Lint, typecheck, unit tests, production build, plus a fresh local database that re-runs ~15 SQL money/security suites. Recent `main` CI is green. |
| Frozen business rules are explicit | Decisions log + guardrail docs tell engineers what not to casually change (fee, trial, verify-anyway, zero-balance gate). |
| Documentation habit | Skills/ops docs, launch tracker, and “ready in repo ≠ ready in prod” language reduce silent drift. |

Rough scale of the app: one Next.js codebase (~24k lines of app TypeScript),
~66 database migrations, ~130+ automated app tests plus dedicated SQL
suites for the fee path. Size is manageable; complexity is concentrated
where money and roles live.

### What is weaker / unfinished

| Gap | Risk if ignored |
|---|---|
| Real-device smoke tests still owed (shopper / merchant / admin) | Repo tests prove logic; they do not prove the till experience on two phones in BBS Mall. |
| Browser E2E exists but is opt-in | Playwright golden path is in repo; it does not yet gate every CI run against a live test env. |
| M-Pesa live end-to-end blocked on IntaSend access | Card sandbox works; Kenya launch path for STK is not fully proven live. |
| Prod env / secrets / scheduled jobs | Production wiring (Vercel env, trial-expiry schedule, Stripe live cutover) is human-owned and still open on the tracker. |
| Legal / DPA | Drafts only; lawyer + incorporation decisions outstanding. |
| Analytics / waitlist ops | Code paths exist; some need env confirmation and production signup verification. |

### How to interpret “quality” as founder

Think of three grades, not one:

1. **Engineering craft on the money spine** — high. Fees, ledger, RLS,
   and regression tests are treated as sacred.
2. **Product completeness for BBS Mall launch** — good in repo, incomplete
   in live ops (device QA, M-Pesa credentials, prod config).
3. **Company readiness** — still gated by legal, marketing ops, and
   human deployment checklists — not by “is the TypeScript pretty?”

### Bottom line for decisions

You do not need to read TypeScript to run the company. You do need to
know: **one app, four roles, one mall first, one fee event that must never
be wrong**. When prioritizing engineering, ask: does this make claim →
verify → KES 30 more reliable, more usable at BBS Mall, or safer for
wallet money? If not, it is usually later.

On quality specifically: **do not confuse green CI with launch.** Trust
the money-path engineering; still insist on the human gates in
`docs/maanta-launch-readiness-tracker.md` (device passes, prod env,
M-Pesa, legal) before treating the product as live-ready.

## Counterfactual: cost to reach this stage without AI

**Context:** this repo’s first commit is **2026-07-04**; the “ready in
repo” state described above was reached in roughly **three weeks** with
heavy AI-assisted engineering (~200 commits, ~80 merged PRs). The
question below asks: if coding AIs did not exist, what would a **solo
founder** typically spend in **cash + labor** to reach a *comparable*
stage (multi-role app, prepaid wallet, claim→verify→KES 30, security
hardening, CI, ops docs) — still **not** including live mall ops, legal
incorporation, or a finished marketing campaign.

These are judgment ranges, not invoices. They assume 2025–2026 market
rates and a founder who directs product but does not personally write
all of the money-path code.

### What “this stage” includes (work packages)

| Package | Rough human effort without AI |
|---|---|
| Shopper + merchant + admin + agent surfaces on one Next.js app | 3–5 person-months |
| Auth, roles, onboarding, Node 0 mall scoping | 0.5–1 person-month |
| Wallet ledger, Stripe + M-Pesa webhooks, idempotency, arrears | 1.5–2.5 person-months (senior) |
| Security / RLS / RPC lockdown + regression suites | 0.5–1.5 person-months (senior) |
| Fraud (Guardian), disputes, fee reversal, admin audit log | 1–2 person-months |
| Automated tests (app + SQL money path) + CI | 1–1.5 person-months (often underfunded) |
| Design system / frozen UI implementation | 1–2 person-months (design + eng) |
| Operating docs, decisions log, launch tracker discipline | 0.5–1 person-month |
| **Total skilled labor** | **~9–16 person-months** |

### Cash + calendar (solo founder, no AI)

| Path | Calendar | Cash outlay (ex-founder living costs) | What you “pay” instead |
|---|---|---|---|
| **A. Technical co-founder** builds most of it | 8–14 months | $5–25k infra/tools/design freelancers | 20–40% equity |
| **B. One strong full-stack hire/contractor** (Africa / regional remote) | 9–14 months | **$70–140k** salary/contract + $10–25k design/security spikes | Your full-time product ownership |
| **C. One senior US/EU contractor** | 7–12 months | **$140–220k** | Faster senior judgment on money/security |
| **D. Small agency / studio** for “MVP+” | 5–9 months | **$120–250k+** | Higher coordination tax; money-path quality varies widely |
| **E. Founder learns to code + freelancers** | 18–30 months | **$40–90k** cash + large opportunity cost | Slowest; highest risk of unsafe money code |

**Central estimate for a careful solo founder who wants this *quality of
money spine* (not a fragile demo):** about **$100–180k cash** and
**~10–14 months**, usually as one senior-capable engineer (or
co-founder) plus occasional design/security help — or **equity** instead
of most of the cash.

Infra itself is cheap pre-launch (hosting, auth, DB, email: typically
low hundreds of USD/month). The expensive part is **people who can be
trusted near a ledger**.

### What this estimate deliberately excludes

- Lawyer-reviewed legal / Kenya DPA / incorporation  
- IntaSend account access, live M-Pesa certification, Stripe live cutover  
- Agency waitlist campaign creative and media  
- Founder’s own time recruiting merchants at BBS Mall  
- Post-launch support staffing  

Those are company costs, not “build the repo” costs.

### How to read the AI compression

Without AI, reaching this repo stage is a **~year and a mid-six-figure
(or equity-equivalent) bet**. With AI, the same *artifact density*
appeared in weeks — but **prod gates, mall trust, and legal** still move
at human speed. AI compressed engineering calendar; it did not delete
the launch checklist.

## Valuation heuristic — 6 months post-launch at BBS Mall

**Not a formal appraisal.** Early-stage company value is mostly a negotiated
story (traction quality × expansion credibility × how competitive the round
is). Revenue is an anchor, not a calculator output.

### First clarify what “$10,000” means

| If $10,000 means… | Rough MAANTA scale | Valuation logic |
|---|---|---|
| **~$10k / month revenue (MRR)** after month 6 | ~$120k ARR run-rate | Real seed conversation; multiples apply |
| **$10k total over 6 months** | ~$1.7k/mo average | Angel / pre-seed; story > multiple |
| **$10k ARR** (~$833/mo) | Very early | Mostly team + proof, not revenue math |

For a “successful BBS Mall” narrative, founders usually mean something closer
to **~$10k MRR** (or exiting month-6 near that run-rate). The ranges below
assume that, unless noted.

What $10k MRR implies economically (order of magnitude, ~KES 130/USD):
- Pure success fees: ~**43k verified redemptions / month** at KES 30 — heavy
  for one mall if fees are the only line.
- More realistic mix: Elite (KES 3,500/mo) + boosts (KES 500) + fees. Example:
  ~150 paying Elite merchants (~$4k) + fee/boost volume making up the rest.
- Investors will ask for **retention**, not just top-ups: repeat redeeming
  shoppers, merchants who re-fund wallets, arrears aging, and whether growth
  is still climbing in month 6.

### Plausible company value ranges (post-money, USD)

Assume: product live, Node 0 only, clean books on MAANTA revenue (fees +
subs + boosts), no major fraud/dispute crisis, and a credible “next 3–5
malls” plan.

| Scenario | What “successful” looks like | Rough company worth |
|---|---|---|
| **Soft** | ~$10k MRR but flat, weak retention, hard to prove mall #2 | **$0.8–1.5M** |
| **Base** | ~$10k MRR, growing MoM, solid merchant + shopper repeat, clear unit economics | **$1.5–3M** |
| **Strong** | ~$10k MRR with rising take, waitlist for next malls, competitive angel/seed interest | **$3–5M** |
| **If $10k was 6-month total revenue** | Proof of life, not scale | **$0.4–1.0M** (mostly team + Node 0 learning) |

Rule-of-thumb anchors (East Africa / early marketplace-SaaS hybrid):
- Early revenue often clears at about **~5–12× ARR** when growth is real and
  the expansion story is believed (~$0.6–1.4M on $120k ARR from multiple alone).
- Rounds usually **price above pure multiple** when Node 0 is treated as a
  **repeatable mall playbook**, and **below** when investors treat it as a
  single-location services business.

### What moves you up or down

**Up:** month-6 still accelerating; low churn; wallet reloads; measured
redemptions (not just claims); signed LOIs / deposits for mall 2–3; tight
fraud losses; founder still deep in BBS operations with clean metrics.

**Down:** one-mall dependency with no second-site proof; revenue mostly
opening credits / one-off top-ups; messy disputes; legal/DPA unfinished;
growth only from heavy manual hustle that doesn’t productize.

### Founder takeaway

At **~$10k MRR after six good months at BBS Mall**, a sober working band for
company value is about **$1.5–3M**, with **~$3–5M** only if the round is
competitive and mall expansion looks inevitable — not automatic. At
**$10k cumulative**, think **under ~$1M** unless the qualitative traction
(engagement, retention, mall operator pull) is unusually strong.

Raise size that often fits that stage: roughly **$300k–750k** seed/angel
against the base band, if you want runway to open the next malls without
selling the company too early.

## What’s needed outside “soft code”

Soft code / eng-ops (device QA, E2E gating, Vercel env, trial cron, FX
SLA provider, waitlist prod verify, analytics env) is **not** listed here.
This is the **company work** that still has to happen even if the repo were
perfect tomorrow. Source of truth for status: `maanta-launch-readiness-tracker.md`.

### 1. Legal & company (blocked / gated)

| Need | Why |
|---|---|
| Kenya incorporation decisions (Nov Nairobi trip) | Unlocks lawyer review of ToS, privacy, wallet/refund, KYC/AML drafts |
| Lawyer-reviewed + published legal docs | Merchants and shoppers need real terms before serious traffic |
| Kenya DPA / cross-border decision (Supabase `eu-west-1`) | Data-residency / contractual basis — launch gate |

### 2. Money rails that are commercial, not code

| Need | Why |
|---|---|
| **IntaSend account + live M-Pesa STK access** | Code exists; Kenya wallet top-ups are blocked on credentials/availability |
| Stripe **live** cutover decision + live-mode test | Sandbox is fine for rehearsal; launch day needs a deliberate go-live |
| Wallet float / opening-credit policy in practice | Who funds Node 0 credits, caps, and arrears chase |

### 3. BBS Mall on the ground

| Need | Why |
|---|---|
| Mall operator relationship + reporting expectations | Comms cadence, complaint path, what numbers the mall sees |
| Merchant pipeline (recruit → visit → top-up → first deal) | A merchant isn’t live until someone can redeem against them |
| Onboarding support ownership | Who answers phones during onboarding week (founder vs agent) |
| On-ground agents trained | 48h lead locks, counter training, dispute follow-up at the till |
| Two-phone family/founder rehearsal **at the shop** | Location checks and real till friction only show up in person |

### 4. Growth / waitlist campaign (mostly agency)

| Need | Why |
|---|---|
| Hand off agency brief + KPIs | Campaign cannot start as “docs in the repo” |
| Segmented waitlist live in the email platform | Shopper / merchant / mall_operator audiences + automations |
| Welcome sequences activated | Drafts exist; sending must be turned on |
| Landing CTAs + 4-week social calendar | Pre-launch month is a marketing product, not an eng sprint |
| Creative approval workflow | Avoid last-minute brand thrash |

### 5. Operating rhythm (people & process)

| Need | Why |
|---|---|
| Weekly ops review habit | Onboarding pipeline, disputes, agent coverage, mall notes |
| 72h dispute SLA staffing | Admin must actually clear uphold/reject in time |
| Support / FAQ ownership | Recurring friction → FAQ or product fix |
| KPI definition used in practice | Redemptions, wallet reloads, arrears, active merchants — not vanity |

### Founder priority order (non-code)

1. **Incorporation + lawyer booked** (unblocks O5/O6)  
2. **IntaSend access escalated weekly** (unblocks Kenya payments)  
3. **Agency brief handed off** + waitlist segments live  
4. **BBS Mall operator agreement** on reporting/comms  
5. **Name the onboarding + dispute owners** for launch week  
6. **In-mall two-phone rehearsal** with real merchants before open

Code can be “ready in repo” and the company still not launchable. The list
above is what turns a working app into a working mall business.

## How to use platforms to polish UI (without breaking the freeze)

MAANTA already has a **Frozen UI**: tokens, vocabulary, and money rules are
locked. Polish means **quiet precision inside those rules**, not a new brand
every week. Use platforms for different jobs in a pipeline — do not ask every
tool to invent the product.

### The recommended pipeline

```text
1. Decide intent     → Notion / founder note (what screen, what feeling)
2. Explore look      → Figma or Claude Design (mock only)
3. Lock the brief    → annotated wireframe + frozen-rule checklist
4. Implement         → Cursor / Claude Code against real routes
5. Review on device  → Vercel preview + two real phones at BBS
6. Record decision   → decisions log only if a frozen rule changes
```

### Platform roles (what each is good for)

| Platform | Use it for | Do not use it for |
|---|---|---|
| **Notion** | Design intent, screenshots of “done”, handoff notes | Pixel implementation |
| **Figma** | Layout exploration, spacing, component variants, founder review frames | Shipping code; inventing new fee/price copy |
| **Claude Design** | Organizing wireframes + emitting an implement prompt (you already have a template in `design-then-implement-prompt-2026-07-24.md`) | Directly editing production money paths |
| **Repo HTML wireframes** (`maanta-app/design/`) | Ground truth for claim/till flows | Long-term design system (prefer Figma + tokens) |
| **Cursor / Claude Code** | Implementing polish in real routes/components under Frozen tokens | Open-ended “redesign the app” without a screen list |
| **Vercel preview URLs** | Shareable review of a PR before merge | Final mall QA (use real phones) |
| **Real iOS + Android phones** | Till friction, OTP, thumb reach, outdoor brightness | Judging type scale on a laptop alone |
| **Lovable / similar builders** | Disposable concept spikes only | Anything that touches wallet, OTP, or YOU PAY — verify before trust |

### Best practice for a solo founder

1. **One surface per polish pass** — e.g. shopper `/feed` only, or merchant redeem only. Mixed passes create thrash.
2. **Money moments first** — deal tile YOU PAY, claim button, OTP ticket, merchant keypad, success “collect from shopper”. These must stay correct; visual polish is secondary.
3. **Brief before generate** — paste frozen invariants into Figma/Claude Design every time: shoppers never pay in-app; amber CTA + black label; ≤1 amber action/screen; warning = rust not red; closed vocabulary.
4. **Design → implement handoff** — have Claude Design (or Figma notes) output a single Cursor prompt with **exact routes** (`/feed`, `/deals/[id]`, `/merchant/redeem`, etc.). Your `design-then-implement-prompt` skill already corrects wrong paths.
5. **Review on preview + phone** — merge only after you tap the flow on a real device; laptop Chrome lies about till UX.
6. **Freeze changes are decisions** — if polish wants a new color rule or fee label, write a decisions-log entry first; otherwise stay inside `frozen-ui-overall-handoff.md` + `claude-design-system.md`.

### Practical weekly rhythm

| Day | Activity |
|---|---|
| Mon | Pick 1–2 screens from the walkthrough / launch QA gaps |
| Tue | Figma or Claude Design exploration (30–90 min), export annotated frames |
| Wed | Cursor implement PR; Vercel preview |
| Thu | Founder phone review + note “keep / change / reject” |
| Fri | Merge or iterate; update Notion screenshot of approved state |

### What “polished” means for MAANTA

Not more gradients, cards, or badges. For this product, polish is:

- Correct YOU PAY every place it appears  
- One clear action per screen  
- OTP readable in bright mall light  
- Merchant keypad fast with thumbs  
- States (expired / already redeemed / arrears) readable without color alone  

If a platform output fights those, discard the output — not the freeze.

## Scale risks & “are we ready for 10,000 users?”

**Short answer:** for **~10,000 users at BBS Mall alone**, the *architecture*
is broadly the right shape (Vercel + Supabase + Clerk + atomic money RPCs +
rate limits + Guardian). You are **not** yet ready for that load as a
*company* (ops, monitoring env, M-Pesa, dispute staffing), and you are **not**
built for multi-mall / 100k-class product scale.

“10,000 users” is fine to plan against if most are casual browsers and a
smaller set claim/redeem. Stress is not raw headcount — it is **concurrent
claims, busy tills, admin queue depth, and wallet/webhook correctness**.

### What can go wrong as you scale (product as a whole)

| Risk | Why it hurts | What you already have | What’s still thin |
|---|---|---|---|
| **Money bugs under load** | Double fee, missed fee, double top-up = trust death | Atomic `claim_deal` / `verify_redemption`; ledger unique `provider_reference`; SQL money-path tests | Live Stripe/IntaSend cutover still human-gated |
| **Arrears pile-up** | Verify-anyway keeps shoppers happy; merchants can owe MAANTA | Arrears recording; top-ups settle arrears first; zero-balance blocks new deals | Collections process + who chases unpaid arrears |
| **Fraud / collusion** | Agents/merchants gaming OTP or velocity | Guardian v1 (velocity, geofence, collusion); soft/hard blocks; admin release | Human review capacity; thresholds need live tuning |
| **Admin / dispute overload** | 72h SLA is a promise | Fee reversal, fraud tasks, admin audit log | No auto-escalation; founder/admin hours are the bottleneck |
| **OTP / till congestion** | Busy Saturday at one shop | 20 OTP checks/min/merchant; unique pending OTP; double-verify → 409 | Extreme till spikes may need staff process, not just code |
| **Feed / browse slowdown** | Shoppers bounce if Discover feels dead | Node-scoped feed, indexes on node/deals | Hard **60-deal** cap; verified counts can grow costly with redemption history; little caching |
| **Single-mall trap** | Success at BBS ≠ product ready for city | `node` on merchants/deals; mall cookie | Only BBS is `live`; onboard/analytics assume Node 0; expansion deferred |
| **Payments availability** | Merchants can’t top up → no deals | Stripe sandbox path; IntaSend code ready | IntaSend access + live STK still a blocker |
| **Ops blindness** | You won’t see fires | Sentry + PostHog wired in code; healthz | Env may still be unset; secrets audit open on tracker |
| **Compliance / trust** | Scale attracts scrutiny | Draft legal in repo | Lawyer publish + Kenya DPA still open |
| **Support / onboarding quality** | Bad first week kills merchant NPS | Agent lead locks; runbook | Named onboarding/support owners still incomplete |

### Infrastructure vs 10k users (honest grade)

| Layer | Fit for ~10k @ one mall | Notes |
|---|---|---|
| Vercel (Next.js app) | ✅ Sufficient | Standard serverless; pages are mostly dynamic (fine at 10k, wasteful later) |
| Supabase Postgres | ✅ Sufficient if plan/connections watched | Money path is DB-centric — right choice; watch connection/CPU as redemptions grow |
| Clerk auth | ✅ Sufficient | Proven at this scale; phone-at-claim already gates abuse |
| Rate limits | ✅ Good for launch abuse | Claim 10/min/user; OTP 20/min/merchant; onboard/top-up/waitlist capped |
| Ledger / webhooks | ✅ Strong foundation | Idempotent credits; failure log + Sentry hook |
| Guardian + admin | 🟡 Product OK, ops thin | Works at Node 0 volumes; breaks if dispute volume ≫ admin hours |
| Caching / pagination | 🟡 OK at BBS catalog size | Not OK if you keep full history scans + no feed pagination into multi-mall |
| Multi-mall product | ❌ Not ready | Intentional — prove Node 0 first |
| Monitoring fully on | 🟡 Code yes / prod ops maybe | Turn on Sentry + PostHog env before any traffic spike |
| M-Pesa live | ❌ / 🟡 | Commercial access gap, not architecture gap |

### What “cope with 10,000 users” actually requires from you

**Already in place (engineering spine):** single app, mall-scoped data,
atomic fee path, idempotent wallet credits, rate limits, fraud gates, CI
money tests, error/analytics hooks in code.

**Must be true in production before you celebrate 10k:**

1. Sentry + PostHog env live and watched weekly  
2. Supabase migrations applied; healthz green; webhook failure table empty-ish  
3. Stripe live (and IntaSend if Kenya top-ups matter) proven on real money  
4. Named humans for merchant onboarding + 72h disputes  
5. Arrears chase rule (who, when, freeze deals escalation)  
6. In-mall rehearsal so Guardian geofence/till UX doesn’t surprise you  

**Defer until after Node 0 PMF (not needed for first 10k at BBS):**

- Multi-mall live flags + onboard-any-node  
- Feed pagination + cached verified counts  
- Heavier CDN/edge caching  
- Automated dispute routing / more admin seats  
- SLA-backed FX (only if non-KES live charges matter)

### Founder takeaway

You have put in place the **right kind of infrastructure for a single-mall
money product** — especially the ledger and abuse controls, which are what
usually kill early marketplaces. You have **not** yet put in place the
**operating infrastructure** (payments go-live, monitoring env, dispute
staffing, legal) that makes 10k users survivable.

Scale failure modes to fear first: **arrears + disputes + blind production**,
not “Postgres can’t hold 10k rows.” Scale failure modes to fear later:
**feed performance and multi-mall productization** once BBS is clearly working.
