# Claude stack setup for MAANTA

Last updated: 2026-08-21 · Status: **recommendation, not installed state.**

What to install and how to start a Claude session so it works on this repo at a
consistent standard. The behavioral rules live in root `CLAUDE.md`; this file is
about tooling and the opening prompt.

## What is already wired in-repo

| Thing | Where | Notes |
|---|---|---|
| Supabase agent skills | `.agents/skills/`, pinned in `skills-lock.json` | `supabase` + `supabase-postgres-best-practices`. Keep the lock file honest — re-pin, don't hand-edit. |
| Supabase MCP | `.cursor/mcp.json` | Points at prod project `axrrslqssmbngbataejg`. **Read-only use from Claude** — migrations are applied by a human (`supabase-migrations.md`). |
| Agent build/run notes | `AGENTS.md` | Local DB, Clerk key requirements, seeding, known gotchas. |
| Product/ops rules | `CLAUDE.md` | Source-of-truth rules, UI bar, guardrails, execution format. |

Anything below is a per-machine install, not a repo dependency. Nothing in CI
depends on these skills — the gates are `lint`, `typecheck`, `test`, `build`,
`db-tests`.

## Recommended first skills

Install these first. Each line says what it is actually for **on MAANTA**.

| Skill | What it does for this repo |
|---|---|
| **SUPERPOWERS** | `obra/superpowers` — skills library + enforced dev methodology. Useful **selectively**; its mandatory pipeline conflicts with this repo's own operating system. See the dedicated section below (added 2026-08-21) before installing. |
| **CAVEMAN** | Forces short, blunt output. MAANTA sessions produce long documents already; this keeps the *chat* terse so the durable artifact carries the detail. |
| **I-HAVE-ADHD** | Keeps a session on one objective. This repo's failure mode is scope drift mid-session — the role system exists for the same reason. Pair it with one Planner/Builder/Reviewer/Operator mode. |
| **UI-UX-PRO-MAX** | The workhorse for shopper/merchant/admin surface work. Use it *with* the frozen UI rules in `CLAUDE.md` — where they disagree, the frozen rules win, because they are enforced in CI by `frozen-ui-rules.test.ts`. |
| **TASTE-SKILL** | Judgment on spacing, hierarchy, type and restraint. This is what keeps surfaces off the generic-AI-gradient default and at the premium/calm bar. |
| **IMPECCABLE** *(later)* | High-rigor review pass. Add it once Node 0 surfaces are stable and the work shifts from building to hardening — running it now would mostly re-report already-tracked drift rows. |

## Running Superpowers on this repo (added 2026-08-21)

Source: `obra/superpowers` (public GitHub, v6.3.0 at time of writing; installs
as a Claude Code plugin). It is two things at once: a library of individually
good skills (test-driven-development, systematic-debugging,
verification-before-completion, writing-plans / executing-plans,
subagent-driven-development, brainstorming, using-git-worktrees, code-review
skills) **and** an enforced methodology — its own words: "mandatory workflows,
not suggestions" — that sequences every task through brainstorm → worktree →
plan → subagent execution → TDD → review → branch finish.

**The verdict: useful, but adopt the skills, not the pipeline.** MAANTA already
has a mandatory process — the CLAUDE.md execution format, the one-mode-per-
session role system, the drift register, the durable-artifact rule. Running a
second mandatory pipeline alongside it is the same failure CLAUDE.md warns
about in code: a second place to enforce a rule is a second place to drift.
Where the two disagree, **CLAUDE.md wins**, always.

What earns its place here:

- **systematic-debugging** — 4-phase root-cause discipline. Directly supports
  "verify first" and is the right tool for prod-incident and drift-hunt
  sessions.
- **verification-before-completion** — the same rule as "never claim green you
  didn't see", enforced from the skill side. Pure alignment.
- **test-driven-development** — matches how this repo already guards behavior
  (SQL assertion suites in `supabase/tests/`, ratchet tests like
  `frozen-ui-rules.test.ts` and `drift-register.test.ts`). Good default for
  money-path and guard work.
- **writing-plans / executing-plans** — fine inside a Planner session; the plan
  artifact doubles as the session's durable artifact.

What to treat with care:

- **brainstorming** (Socratic design refinement) — never point it at a frozen
  business rule or anything founder-held. MAANTA's rule is the opposite of
  brainstorming: if the answer isn't in the decisions log / tracker / register /
  a migration, it is an *open question to surface*, not a design space to
  explore. Safe for genuinely open technical shape questions only.
- **subagent-driven-development** — fan-out is for audit/read sessions. Build
  sessions here want small, high-confidence diffs from one pair of hands.

What has low value here:

- **using-git-worktrees / finishing-a-development-branch** — remote sessions
  already work on a designated branch with a prescribed push flow, and
  migrations are applied by a human regardless. Parallel worktrees solve a
  problem this repo's workflow doesn't have.

**Status 2026-08-21: the aligned bits are vendored in-repo.** The four
adopt-list skills now live as MAANTA-adapted project skills under
`.claude/skills/` — `systematic-debugging`, `verification-before-completion`,
`test-driven-development`, and `implementation-plans` (writing-plans +
executing-plans merged, pipeline handoffs removed) — so every Claude Code
session on this repo loads them with no plugin install. Each is rewritten
around this repo's real gates (`npm run lint|typecheck|test|build`,
`make db-verify`), the drift register, and CLAUDE.md precedence; attribution
and the MIT license text are in `.claude/skills/LICENSE-superpowers.md`.
Installing the full plugin per-machine remains optional for the rest of its
library — it is not a repo dependency and nothing in CI depends on it. If
its skill-check preamble tries to route a MAANTA task into its full
pipeline, the session bootstrap prompt below still governs: one mode, one
objective, smallest safe diff, CLAUDE.md precedence.

## Running UI-UX-PRO-MAX on this repo (added 2026-08-20)

Source: `nextlevelbuilder/ui-ux-pro-max-skill` (public GitHub). It is a
BM25 search engine over local CSV data — 79 UI styles, 192 product reasoning
rules, 119 UX guidelines, font/color/chart/stack datasets — plus a
`--design-system` generator. Python 3, no external dependencies.

**Install (pick one):**

- Claude Code plugin (preferred — keeps this repo clean):
  `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` then
  `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`.
- Or clone the repo anywhere and call the script directly:
  `python3 <clone>/.claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>`.
- Do **not** run `uipro init` inside this repo and do not commit its
  `design-system/` output — MAANTA's design system already exists and is
  enforced (`tailwind.config.ts` tokens, `src/components/ui/claude/`,
  `frozen-ui-rules.test.ts`).

**The precedence rule, concretely.** The skill's *style/color/typography/
landing* domains propose palettes, fonts and hero patterns. On MAANTA those
decisions are already made and CI-enforced, so those domains are read-only
inspiration at best. What is safe and high-value everywhere is the **`ux`
domain** (119 guidelines: contrast, touch targets, focus, forms, error
placement, responsive, reduced-motion), the **`chart` domain** for admin
density, and `--stack nextjs`. Anything the skill suggests that touches an
enforced rule loses: amber CTA + black label, money never coloured, error
body text `#111`, closed vocabulary, no celebratory motion. Its own
anti-pattern data (no AI gradients, no emoji icons, no colour-only state)
happens to agree with the CLAUDE.md "do not" list — that agreement is why
the skill is worth running, not a licence to adopt its palettes.

**Per-surface query recipes** (2–5 terms, one intent per query; retry once
narrower, never persist unverified output):

| Surface | Useful queries |
|---|---|
| Shopper (`/feed`, `/browse`, `/map`, `/my-deals`, tickets) | `"bottom navigation mobile" --domain ux` · `"card list scannable hierarchy" --domain ux` · `"countdown urgency honest" --domain ux` · `"empty state next action" --domain ux` |
| Merchant (wallet, top-up, deals, verify) | `"form inline validation error" --domain ux` · `"destructive action confirmation" --domain ux` · `"progressive disclosure wizard" --domain ux` · `"loading feedback optimistic" --domain ux` |
| Admin / agent / founder | `"data table dense dashboard" --domain ux` · `"real-time dashboard" --domain chart` · `"filter search table" --domain ux` |
| Marketing (17 routes under `(marketing)/`) | `"marketplace local deals" --domain product` · `"hero social-proof" --domain landing` · `"pricing table clarity" --domain ux` — copy/number rules still apply: facts from `lib/marketing/facts.ts`, held-claims and token gates run in CI |
| Any surface, pre-delivery | `"focus not obscured" --domain ux` · `"contrast dark mode" --domain ux` · then the skill's `references/pro-rules.md` checklist |

**Session shape.** One surface family per session (the role system's rule).
Read `frames.json` first so polish lands on `live`/`gated` surfaces, not
`design-ahead` ones. Apply changes through the primitives in
`src/components/ui/claude/` and tokens in `tailwind.config.ts` — the skill's
"no raw hex in components" rule is already MAANTA law. Verify with
`npm run lint`, `npm run typecheck`, `npm test` (frozen-ui-rules must stay
green), `npm run build` (token/canonical/form gates) — same gates as any UI
diff.

## Combining the two: the UI optimization loop (added 2026-08-21)

UI-UX-PRO-MAX and the vendored superpowers skills are complementary halves
of one loop. **PRO-MAX proposes the *what*** — it is a knowledge base that
surfaces candidate improvements. **The `.claude/skills/` set enforces the
*how*** — plan, test-first, verify, so the improvement lands without
breaking an enforced rule. Neither outranks the frozen rules; those filter
everything in both directions.

Run it as two sessions per surface family (the role system's
one-mode-one-objective rule):

**Session A — Planner: find and filter.**

1. Read `frames.json`; scope to `live`/`gated` surfaces only. Skim the
   drift register so known gaps aren't re-proposed as new findings.
2. Query PRO-MAX with the per-surface recipes above (app surfaces: `ux` and
   `chart` domains; marketing routes may also use `product`/`landing` as
   inspiration). Collect candidate findings.
3. Filter each finding through three gates, in order:
   - **Frozen UI rules** (`frozen-ui-rules.test.ts` list) — a colliding
     finding dies here, whatever PRO-MAX says.
   - **CLAUDE.md do-nots and the quality bar** — calm, honest states, closed
     vocabulary; no gradients/motion/emoji-on-money.
   - **Layer check** — anything touching money, access or claims is not a
     UI finding; it routes to the money-trust guardrails doc and the RPC
     layer, or becomes a founder question.
4. Write the survivors into a plan with the `implementation-plans` skill →
   `docs/plans/YYYY-MM-DD-<surface>-polish.md`. Each task cites the PRO-MAX
   guideline it implements and the frozen rules it must not touch; each is
   TDD-shaped with real code and real commands. The plan is the session's
   durable artifact.

**Session B — Builder: land and verify.**

5. Execute the plan with `test-driven-development`: failing test first
   (a new enforced rule gets a new guard test beside the existing ratchets),
   then minimal implementation through `src/components/ui/claude/`
   primitives and `tailwind.config.ts` tokens only.
6. Anything breaks — a guard test, a build gate, an unexpected render —
   switch to `systematic-debugging` before touching more code.
7. Close with `verification-before-completion`: `npm run lint`,
   `npm run typecheck`, `npm test` (frozen-ui-rules green), `npm run build`
   (token/canonical/form gates). Pre-delivery, run PRO-MAX's own checklist
   queries (`"focus not obscured"`, `"contrast dark mode"`) as a last sweep.
8. Standard session close: check off the plan, record any drift found,
   update the tracker if a gate moved.

The division of authority, in one line: **PRO-MAX suggests, the frozen
rules veto, the vendored skills prove.** A finding that survives step 3 and
ships through steps 5–7 is an optimization; anything that skips either half
is either taste (unproven) or risk (unfiltered).

## Nice to have

| Skill | When it earns its place |
|---|---|
| **HUMANIZER** | Shopper-facing and merchant-facing copy. Constraint: the in-app closed vocabulary (claim / redeem / deal / wallet / top up / success fee) is frozen and grep-enforced — humanize the marketing pages, not the money flow. |
| **AGENT-BROWSER** | Real browser verification of shipped surfaces. Note the blocker in `AGENTS.md`: Clerk gates every route and interactive browsing needs valid Clerk keys for the repo's instance, not placeholders. |
| **CLAUDE-HUD** | Session visibility — useful during long audit or migration-review sessions where you want to see what the model is actually doing. |

## Avoid for now

- **Motion, video, animation and 3D skills** — unless a specific task calls for
  it. The frozen UI rules ban celebratory motion on money surfaces outright, and
  the aesthetic target is calm. A motion skill will push against the house style
  every time.
- **Growth, content, SEO and research skills** — until Node 0 product surfaces
  are stable. Growth work has its own track and its own docs
  (`maanta-marketing-agency-brief.md`, the email sequences); mixing it into a
  product session is how both end up half-done.
- **Anything that writes to production** — Supabase MCP included. Read-only from
  Claude; the apply step is human.

## Session bootstrap prompt (copy-paste)

```text
Before doing anything:

1. Read root CLAUDE.md in full. It is the operating standard for this repo.
2. Read the truth sources relevant to this task before editing anything:
   - docs/maanta-launch-readiness-tracker.md (what is gating launch)
   - docs/maanta-drift-register.md (known claim-vs-reality gaps — search it
     before reporting anything as new)
   - maanta-app/design/current-reality/frames.json (is this surface live,
     gated, rehearsal, design-ahead or blocked?)
   - the relevant docs/ops/ runbook and docs/skills/ handoff
   - for money/trust work: docs/skills/money-trust-engineering-guardrails.md
     and the migration that owns the behavior
3. AGENTS.md for build/run mechanics (local DB, Clerk keys, seeding).

Then work like this:

- Verify before editing. The repo wins over my description of it. If a doc, a
  comment, a wireframe and the code disagree, name the conflict — do not pick
  one silently and do not invent a rule to cover the gap.
- Prefer the smallest safe diff. Extend existing patterns; don't add a second
  place a rule is enforced.
- UI work is held to the CLAUDE.md quality bar: premium, calm, trustworthy,
  investor-grade. Hierarchy, spacing, typography, honest states. No AI
  gradients, no glassmorphism, no decorative motion, no emoji on money screens.
  The frozen UI rules are enforced in CI and override any style preference.
- Backend is the source of truth for money, access control and fraud. A UI-only
  change does not close one of those gaps.
- Do not run migrations against production. Write it, test it locally, hand the
  apply to a human.

Checks: from maanta-app/ run `npm run lint`, `npm run typecheck`, `npm test`,
and `npm run build`. If you touched SQL, run `make db-verify` from the repo
root. CI blocks on all of these plus db-tests — passing only `npm test` is not
verified.

Output: direct and operational, no preamble. Finish with — files changed ·
what you ran and what it said · drift found (add rows to the drift register
before writing any narrative) · decisions still needed from me.

Leave at least one durable artifact before you finish: a docs/skills/*.md
update, a tracker update, an ops or marketing brief, or an approved markdown
export. Chat history is not an artifact.

State your mode for this session: Planner, Builder, Reviewer, or Operator.
One objective, one deliverable family.
```

## Short version, for a small task

```text
Read CLAUDE.md. Check the drift register and frames.json before treating
anything as new. Verify before editing, smallest safe diff, frozen UI and money
rules apply. Run lint + typecheck + test + build (and make db-verify if SQL
changed). Summarize files changed, what you verified, and what still needs me,
and leave a durable artifact — not just chat.
```
