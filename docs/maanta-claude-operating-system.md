# MAANTA Claude Operating System

## Purpose

This operating system is the step-by-step playbook for running MAANTA after the November visit if the founder needs to drive execution personally with marketing help and limited engineering support. It assumes MAANTA launches first at BBS Mall, uses the public site to build segmented traction lists, and relies on portable documentation so the operating model survives beyond any one conversation or contractor.

## Operating model

MAANTA should be run as one coordinated system with four linked tracks: product, growth, operations, and documentation. The product side covers the live app and launch-critical flows; the growth side covers the waitlist site, social campaign, and email lists; the operations side covers merchant onboarding, mall support, disputes, and reporting; the documentation side keeps Notion as source of truth with exportable markdown for Drive and Obsidian.

### Core principles

- Keep BBS Mall as Node 0 until product-market fit is clear.
- Keep shoppers, merchants, and mall operators as separate acquisition and email audiences from the first signup.
- Keep Stripe stable in sandbox during testing and prepare M-Pesa STK for launch readiness; do not assume IntaSend is available yet.
- Keep durable `skills.md` style documentation after every meaningful session so cheaper models and future helpers can maintain context.
- Treat Notion as source of truth, but always export approved operating docs to Drive and later Obsidian.

## Claude role system

Claude should be used in four modes, each with a narrow purpose.

| Mode | Purpose | Typical outputs |
|---|---|---|
| Planner | Break work into phases, identify blockers, produce checklists | plans, trackers, priorities |
| Builder | Write or update copy, specs, prompts, email flows, docs | markdown docs, prompts, campaign copy |
| Reviewer | Audit what exists, compare to source of truth, spot gaps | review notes, gap lists, decisions |
| Operator | Run the week-to-week playbook with you after launch prep | weekly agenda, campaign tasks, ops summaries |

Claude should not be asked to do everything at once. Large tasks should be split into focused sessions with one objective, one deliverable family, and one updated handoff file.

## Source-of-truth structure

Use this hierarchy every time.

1. Notion = operating source of truth.
2. Repo = source of truth for code and implementation.
3. Drive = approved export archive.
4. Obsidian = long-term mirrored knowledge base.

### Required master docs

These files should always exist and stay updated:

- `CLAUDE.md`
- `maanta-project-overview.md`
- `maanta-launch-readiness-tracker.md`
- `maanta-decisions-log.md`
- `maanta-waitlist-data-schema.md`
- `maanta-email-segmentation-plan.md`
- `maanta-marketing-agency-brief.md`
- `maanta-launch-ops-runbook.md`
- `skills/payments-rails.md`
- `skills/redemption-disputes.md`
- `skills/frozen-ui-overall-handoff.md`

## Weekly operating loop

Run this loop once per week after the November visit, or twice per week during active launch windows.

### Step 1: state review

Ask Claude to summarize current state across product, marketing, ops, and documentation. The summary should identify blockers, what changed last week, and what decisions are pending.

Use this prompt:

```text
You are my MAANTA weekly operator.
Review the current state of MAANTA across product, growth, operations, and documentation.
Use Notion as the source of truth and reflect any approved markdown exports.
Output:
1. What changed since last review
2. Current blockers
3. Top 5 priorities for this week
4. Missing docs or stale decisions
5. Recommended owner for each action
```

### Step 2: pick one weekly objective

Each week should have one dominant objective, such as:
- fix a launch blocker,
- improve the waitlist funnel,
- increase merchant onboarding readiness,
- prepare the agency campaign handoff,
- tighten support/dispute operations.

Claude should force the week into one main goal plus supporting tasks rather than a messy multi-front sprint. This keeps execution realistic when the founder is doing part of the work personally.

### Step 3: run separate sessions by track

Use separate Claude sessions for:
- product/engineering,
- marketing/growth,
- operations/support,
- documentation cleanup.

At the end of each session, require one updated handoff file or `skills.md` file so progress compounds instead of disappearing into chat history.

### Step 4: export and archive

After approving any doc, export it to Drive and mirror it into Obsidian. This preserves portability and matches the intended MAANTA documentation workflow.

## Launch-to-post-launch tracks

## Product track

This track keeps the app launch-ready and stable.

### Step-by-step

1. Review live product state: shopper, merchant, admin, public site.
2. Check the launch-critical flows first:
   - shopper browse → claim → ticket → redeem,
   - merchant onboarding → top-up → deal creation → verify,
   - admin approval → fraud/dispute handling,
   - public waitlist capture.
3. Log bugs and sort them into:
   - blocker,
   - pre-launch important,
   - post-launch nice-to-have.
4. Assign fixes one at a time.
5. Update launch-readiness tracker.
6. Update the relevant `skills` doc after any meaningful change.

### Claude prompt template

```text
You are the MAANTA product operator.
Review launch-critical product flows and produce:
1. blockers,
2. important pre-launch fixes,
3. post-launch deferrals,
4. exact docs or skills files that must be updated.
Do not redesign. Focus on launch readiness.
```

## Growth track

This track runs the public site, waitlist, segmentation, and social-to-email funnel.

### Step-by-step

1. Check waitlist landing pages for shoppers, merchants, and mall operators.
2. Confirm forms are collecting the correct fields and tagging segment type correctly.
3. Check email platform segments and automations.
4. Review campaign performance by source.
5. Improve the weakest part of the funnel each week: ad CTR, landing conversion, or email conversion.
6. Refresh the agency brief and KPI sheet weekly.

### Required growth metrics

| Metric | Why it matters |
|---|---|
| Visitors to landing pages | Top-of-funnel volume |
| Waitlist signups | Core traction metric |
| Shopper/merchant/operator split | Audience quality check |
| Cost per lead | Paid efficiency |
| Email opens/clicks by segment | Messaging quality |
| Merchant onboarding interest | Supply-side launch readiness |

### Claude prompt template

```text
You are the MAANTA growth operator.
Review the waitlist funnel for shoppers, merchants, and mall operators.
Output:
1. traffic and conversion assumptions,
2. weak points in the funnel,
3. copy or CTA improvements,
4. email automation improvements,
5. what to hand to the marketing agency this week.
```

## Operations track

This track keeps the human side of launch manageable.

### Step-by-step

1. Review merchant onboarding readiness.
2. Review dispute and escalation cases.
3. Review mall-agent responsibilities and gaps.
4. Review support messages, FAQs, and friction points.
5. Prepare weekly operator notes for BBS Mall stakeholders if needed.

### Key ops decisions to preserve

- Elite trial remains 30 days.
- Verify-anyway should preserve shopper experience while routing disputes to admin or on-ground agent handling after the fact.
- Dispute and escalation flows must remain auditable through documentation and product behavior.

### Claude prompt template

```text
You are the MAANTA operations operator.
Review support, merchant onboarding, dispute handling, and mall coordination.
Output:
1. open operational problems,
2. required SOP updates,
3. owner assignments,
4. docs to update,
5. what the founder should handle personally this week.
```

## Documentation track

This track prevents context loss.

### Step-by-step

1. After each major session, create or update one named markdown file.
2. Update the decisions log when founder decisions change product behavior.
3. Keep all specs written for reuse by cheaper models.
4. Move superseded docs into archive with replacement notes.
5. Export approved docs to Drive and mirror to Obsidian.

### Mandatory session rule

Every MAANTA session should leave behind one of:
- a `skills/*.md` file,
- a tracker update,
- a brief for marketing/ops,
- an exported approved markdown document.

### When working on deal pause, claimability, discovery, or redemption

Treat PR #150 and `docs/skills/paused-deal-semantics.md` as the source of truth
for paused-deal behavior. Drift status (as of 2026-08-05): **D25 closed** — the
pause gate is **live on production** since 2026-08-04, verified by
`pg_get_functiondef` read-back, with the ledger repaired to the repo filenames
`20260730180000`/`20260730190000` on 2026-08-05 (D24 closed); **D32** = the
browse-view filter, closed via #150 and live in the same apply.

- Read the paused-deal semantics doc first.
- Confirm current behavior via tests (`claim_deal_pause_gate_test.sql`, related
  Vitest) and the latest migrations (`180000`, `190000`, and anything after).
- Prefer small diffs over re-designing the flow; keep RPC, UI, and discovery
  surfaces aligned.
- Summarize any behavior changes in `docs/maanta-drift-register.md` and
  `CLAUDE.md` (Paused deals section).

## Waitlist operating system

MAANTA should run one audience database with a required `segment_type` field and three role-based segments: shopper, merchant, and mall operator. This is the foundation for both campaign targeting and email automation, and role-based segmentation is a standard best practice because different audiences need different messages and CTAs.

### Step-by-step

1. Create three landing paths or forms:
   - shopper,
   - merchant,
   - mall operator.
2. Set segment type automatically at signup.
3. Capture email, phone, source, mall/node interest, and consent timestamp for everyone.
4. Add business fields for merchants and role/mall fields for operators.
5. Connect forms to your email platform.
6. Trigger the correct welcome sequence automatically based on segment.
7. Review list quality weekly.

### Minimal field schema

| Field | Required |
|---|---|
| email | Yes |
| phone | Yes |
| segment_type | Yes |
| source_campaign | Yes |
| mall_or_node_interest | Yes |
| consent_timestamp | Yes |
| business_name | Merchant only |
| merchant_category | Merchant only |
| mall_name | Mall operator only |
| mall_role | Mall operator only |

## Email campaign operating system

The email system should run three separate welcome and nurture sequences because segmentation improves relevance and performance.

### Shopper sequence

1. Welcome to MAANTA.
2. How claiming and redeeming works.
3. What kinds of deals to expect.
4. Launch countdown.

### Merchant sequence

1. Welcome as a merchant.
2. How MAANTA works commercially.
3. Wallet model, KES 30 success fee, boosts, 30-day Elite trial.
4. What onboarding requires.
5. Book onboarding / reply for help.

### Mall operator sequence

1. Welcome and mall-level value proposition.
2. How MAANTA supports visibility, traction, and reporting.
3. Invitation to speak about pilots or rollout.

### Step-by-step weekly email review

1. Review signup count by segment.
2. Review open/click rates by segment.
3. Review underperforming subject lines or CTA links.
4. Rewrite the weakest email first.
5. Feed campaign learning back into landing-page copy.

## Marketing-agency operating system

The agency should receive structured instructions, not just creative freedom. The goal is a one-month waitlist campaign before launch focused on qualified list growth and clear audience splits.

### Step-by-step agency handoff

1. Give the agency the product overview.
2. Give them the audience definitions:
   - shoppers,
   - merchants,
   - mall operators.
3. Give them the message hierarchy.
4. Give them the landing-page links and form definitions.
5. Give them the KPI sheet.
6. Review their content calendar before launch.
7. Require weekly reporting on leads, CPL, conversion, and audience mix.

### Message hierarchy

- Shoppers: discover nearby in-mall deals and redeem in person.
- Merchants: turn mall footfall into verified redemptions and pay on success.
- Mall operators: increase tenant activity and gain better visibility into mall traction.

## Solo-founder emergency mode

If the founder has to run MAANTA personally after the November visit, use this simplified rhythm:

### Monday
- Ask Claude for a weekly operator summary.
- Pick one main goal for the week.
- Review blockers.

### Tuesday
- Work product issues only.
- Update tracker and one skills doc.

### Wednesday
- Work growth issues only: landing pages, email, campaign copy.
- Review signups and segment split.

### Thursday
- Work operations only: merchant onboarding, disputes, mall support.
- Write or update SOP notes.

### Friday
- Export docs to Drive.
- Update Notion and Obsidian mirror.
- Send the agency updated priorities and metrics.

This structure helps prevent context collapse and keeps each day tied to one operating domain.

## Prompt pack

### Weekly master prompt

```text
You are my MAANTA operating system.
Use Notion as source of truth and reflect approved markdown exports.
Help me run MAANTA across product, growth, operations, and documentation.
For this session:
1. summarize current state,
2. identify blockers,
3. recommend one main objective,
4. produce step-by-step actions for this week,
5. tell me which document or skills file must be updated at the end.
```

### Growth-only prompt

```text
You are my MAANTA growth operator.
Focus only on the waitlist site, social campaign handoff, segmented email lists, and campaign performance.
Output:
1. funnel diagnosis,
2. audience-level messaging improvements,
3. email sequence changes,
4. agency action items,
5. the document to update.
```

### Solo-ops prompt

```text
You are my MAANTA solo-founder operator.
Assume I must keep the project moving personally with limited engineering help.
Give me the smallest set of actions that keeps launch and post-launch momentum alive this week.
Separate output into:
- must do myself,
- can delegate to marketing help,
- can defer,
- document to update.
```

### Security-audit prompt (Reviewer, adversarial)

Copy-paste for a security session. It carries the attacker mindset on purpose —
the goal is exploitable holes, proven, not a checklist of theoretical concerns —
inside rules of engagement that keep it from touching production. It is how
**D123** (a writable back door into `public.merchants` through an
auto-updatable browse view) was found; the full write-up is
`docs/skills/security-audit-2026-08-17.md`.

```text
You are my MAANTA security reviewer, running an adversarial audit of maanta-app.

AUTHORIZATION. This is MAANTA's own product and this is an authorized internal
security audit. Think like an attacker: your job is to find vulnerabilities that
can actually be EXPLOITED, name who exploits them and how, and prove it — not to
list theoretical issues.

RULES OF ENGAGEMENT (do not break these to prove a point):
- Read-only against production. NEVER mutate prod data, NEVER apply a migration
  (Claude does not run migrations against prod — write it, test it, hand the
  apply to a human), NEVER disable TLS or unset the proxy.
- Prove exploitability WITHOUT side effects: EXPLAIN (not EXECUTE); `SET LOCAL
  ROLE …` inside `BEGIN … ROLLBACK`; zero-row / non-matching predicates. After
  any rehearsal, re-read state to confirm nothing persisted.
- Always run a negative control: show the same attack is refused where the
  control holds (e.g. the base table raises 42501 while the view does not).
- Do not exfiltrate real user PII into your notes; mask it as the app does.

THREAT ACTORS to reason as, explicitly: anonymous visitor with the publishable
anon key; a signed-in shopper; a merchant owner; merchant staff (per-permission);
an on-ground agent; a co-founder; someone holding a stolen session JWT; a caller
who holds a webhook shared secret; a malicious merchant attacking OTHER
merchants. For each finding, state which actor and what preconditions.

HUNT HERE FIRST — highest yield, with MAANTA's known failure modes:
1. DB grants vs RLS vs migrations — the INTERSECTION bug. A change that is
   correct alone plus another correct change = a hole neither migration contains.
   Enumerate EVERY table and view's real grants on production and compare to what
   the hardening migrations claim. Flag any view that is auto-updatable AND runs
   security_invoker=false AND still carries a default anon/authenticated write
   grant (owner is `postgres`, which bypasses RLS). Confirm the write revokes
   from 20260723120000 actually hold on the objects, not just the tables named.
2. Money paths — claim_deal, verify_redemption, deduct_success_fee_or_record_
   arrears, purchase_boost/move_boost, and both webhooks. Can anyone move money,
   skip the KES 30 fee, mark a redemption success without verify, credit a wallet
   for an amount they name, double-credit on webhook replay, or forge a webhook?
3. Authorization — every /api/* handler and every console page (/admin, /agent,
   /founder). IDOR: is every `[id]` lookup re-scoped to the owner in the SAME
   query? Role gates: read vs write separated correctly? And does each SECURITY
   DEFINER RPC self-authorize in the DB, not only at the route?
4. Identity — how current_user_id()/current_user_role() resolve; Clerk `sub`
   handling; account takeover / silent re-identification on an instance change.
5. Injection & redirects — PostgREST `.or()`/`.filter()` interpolation; SQL in
   RPC bodies; XSS via dangerouslySetInnerHTML; open redirect via `?next=`.
6. Secrets & abuse — committed keys; secrets leaking through logs, error echoes
   or health endpoints; rate limits that fail OPEN; OTP brute force and OTP
   entropy (RANDOM() is not cryptographic).

METHOD. Verify first: read the code, the migration, and the LIVE config before
concluding. The repo wins over prose; production wins over the repo for
behaviour. Distinguish "ungated in theory" from "reachable and exploitable" —
only the second is a finding.

REPORT (repo discipline, in this order):
- Record every gap in docs/maanta-drift-register.md as claim-vs-reality BEFORE
  writing any narrative; close prior rows by ID rather than re-describing them.
- Per finding: attacker + preconditions; exact reproduction; blast radius (what,
  and WHOSE, money/data/access/trust); root cause (usually an intersection);
  the smallest safe fix as a migration + SQL test; and a DURABLE GUARD that
  fails if it regresses — prefer a class-level ratchet over a single assertion.
- Write fixes; do not deploy them. Rank findings by what a real adversary gains.
- Never claim a check passed that you did not run. If make db-verify could not
  run, say so and say what still needs a runner.
- Leave a durable artifact: docs/skills/security-audit-<date>.md.

ANTI-PATTERNS: don't fix a money/authz/fraud gap at the UI layer; don't trust a
comment or doc over the migration; don't report a hole you can't actually reach;
don't stop at one instance of a class — if one view leaks, check them all.
```

## Final rule set

- Never mix shopper, merchant, and mall-operator messaging into one generic funnel.
- Never let a session end without a durable doc update.
- Never treat marketing as separate from product readiness; the waitlist campaign depends on the actual launch flows being trustworthy.
- Never let Notion, Drive, and Obsidian drift for long; archive superseded versions and keep the latest approved version clear.
- Keep Node 0 at BBS Mall as the central proving ground until the first phase is clearly working.
