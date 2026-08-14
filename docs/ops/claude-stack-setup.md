# Claude stack setup for MAANTA

Last updated: 2026-08-14 · Status: **recommendation, not installed state** — except
the "already wired in-repo" table below, which is installed state and is where the
2026-08-14 design-engineering skills landed.

What to install and how to start a Claude session so it works on this repo at a
consistent standard. The behavioral rules live in root `CLAUDE.md`; this file is
about tooling and the opening prompt.

## What is already wired in-repo

| Thing | Where | Notes |
|---|---|---|
| Supabase agent skills | `.agents/skills/`, pinned in `skills-lock.json` | `supabase` + `supabase-postgres-best-practices`. Keep the lock file honest — re-pin, don't hand-edit. |
| Design-engineering skills | `.agents/skills/`, symlinked from `.claude/skills/`, pinned in `skills-lock.json` | All ten of `emilkowalski/skills`, installed 2026-08-14 by founder ruling. **Read `docs/skills/design-engineering-skills.md` before applying any of them** — it carries the precedence order and the three places their defaults collide with the frozen UI rules. |
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
| **SUPERPOWERS** | Broad capability pack — better search, planning and multi-file work. The baseline for audit-style sessions that have to read across `docs/`, `src/` and `supabase/` before touching anything. |
| **CAVEMAN** | Forces short, blunt output. MAANTA sessions produce long documents already; this keeps the *chat* terse so the durable artifact carries the detail. |
| **I-HAVE-ADHD** | Keeps a session on one objective. This repo's failure mode is scope drift mid-session — the role system exists for the same reason. Pair it with one Planner/Builder/Reviewer/Operator mode. |
| **UI-UX-PRO-MAX** | The workhorse for shopper/merchant/admin surface work. Use it *with* the frozen UI rules in `CLAUDE.md` — where they disagree, the frozen rules win, because they are enforced in CI by `frozen-ui-rules.test.ts`. |
| **TASTE-SKILL** | Judgment on spacing, hierarchy, type and restraint. This is what keeps surfaces off the generic-AI-gradient default and at the premium/calm bar. |
| **IMPECCABLE** *(later)* | High-rigor review pass. Add it once Node 0 surfaces are stable and the work shifts from building to hardening — running it now would mostly re-report already-tracked drift rows. |

## Nice to have

| Skill | When it earns its place |
|---|---|
| **HUMANIZER** | Shopper-facing and merchant-facing copy. Constraint: the in-app closed vocabulary (claim / redeem / deal / wallet / top up / success fee) is frozen and grep-enforced — humanize the marketing pages, not the money flow. |
| **AGENT-BROWSER** | Real browser verification of shipped surfaces. Note the blocker in `AGENTS.md`: Clerk gates every route and interactive browsing needs valid Clerk keys for the repo's instance, not placeholders. |
| **CLAUDE-HUD** | Session visibility — useful during long audit or migration-review sessions where you want to see what the model is actually doing. |

## Avoid for now

- ~~**Motion, video, animation and 3D skills**~~ — **superseded 2026-08-14
  (founder ruling, decisions log; drift D98).** The ten `emilkowalski/skills`
  design-engineering skills are now installed in-repo, so this is no longer a
  "avoid" but a "govern": the reasoning that produced the original line still
  holds — the frozen UI rules ban celebratory motion on money surfaces outright,
  and the aesthetic target is calm — so a motion skill *will* push against the
  house style, and the house style wins. The precedence order, MAANTA's existing
  five-animation vocabulary, and the specific collisions (`ask-sonner` vs frozen
  rule 3; `animate` / `find-animation-opportunities` / `prototype` vs money
  surfaces; any skill that recommends a new dependency) are in
  `docs/skills/design-engineering-skills.md`. Video and 3D skills stay off the
  list. Note that motion restraint is carried by review, not by CI —
  `frozen-ui-rules.test.ts` enforces colour and copy, not animation.
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
