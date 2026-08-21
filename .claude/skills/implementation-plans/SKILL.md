---
name: implementation-plans
description: Use in a Planner session when a multi-step MAANTA task needs a written plan another session (or a human) will execute, and in the executing session that picks one up. Combines superpowers' writing-plans and executing-plans, minus the pipeline machinery.
---

# Implementation Plans

Adapted from obra/superpowers `writing-plans` + `executing-plans` (MIT — see
`../LICENSE-superpowers.md`). The worktree / subagent / brainstorming
handoffs were intentionally dropped: MAANTA's role system (one mode, one
objective, one deliverable family) and CLAUDE.md execution format govern
process. A plan here is a **Planner-session durable artifact**; executing it
is a **Builder session**.

## Writing a plan

**Save to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`. That file is the
session's durable artifact.

**Write for an engineer with zero MAANTA context and questionable taste.**
Skilled, but they don't know the frozen rules, the drift register, or that
the RPC — not the UI — is the enforcement point. The plan carries everything:
exact files, actual code, actual test code, exact commands with expected
output.

### Required header

```markdown
# <Feature> Implementation Plan

**Goal:** <one sentence>
**Architecture:** <2–3 sentences>
**Spec / truth sources:** <the decisions-log entry, drift row, tracker line,
or migration this plan implements — the plan argues from these>

## Global constraints
<one line each, values verbatim — e.g. frozen rules touched, "fees read from
app_config, never hardcoded", "no raw hex, tokens + ui/claude primitives",
"migration versions come from the prod ledger, not ls", "Claude does not
apply migrations to production">
```

On MAANTA the "spec" is usually already written: the decisions log, the
readiness tracker, a drift row, `paused-deal-semantics.md`. The plan cites
them; it never invents a product rule. If a needed rule doesn't exist, the
plan stops at an open question for the founder — that's a finding, not a gap
to fill in.

### Task structure

Each task is the smallest unit with its own test cycle: exact file paths
(`Create:` / `Modify: path:lines` / `Test:`), the interfaces it consumes and
produces (exact signatures — the executor may see only this task), then
bite-sized checkbox steps, TDD-shaped:

1. Write the failing test (actual code in the plan)
2. Run it, verify it fails (exact command, expected failure)
3. Minimal implementation (actual code)
4. Run it, verify it passes
5. Commit

DB-behavior tasks put the test in `supabase/tests/*.sql` and verify with
`make db-verify`; a migration task ends with "hand apply to human" — never
"apply to prod".

### No placeholders

"TBD", "add appropriate error handling", "write tests for the above",
"similar to Task N" — each is a plan failure. Show the code, repeat the code.

### Self-review before saving

1. **Coverage:** every spec/truth-source requirement maps to a task.
2. **Placeholder scan:** none of the patterns above survive.
3. **Consistency:** names/types used in later tasks match earlier
   definitions exactly.
4. **MAANTA pass:** frozen rules named in constraints; enforcement lives at
   the right layer; every task's checks are the real gates (`lint`,
   `typecheck`, `test`, `build`, `make db-verify` for SQL).

## Executing a plan

1. Read the whole plan **and its cited truth sources** critically first.
   Concerns or contradictions with current code → raise them (and check the
   drift register) before starting, don't silently patch the plan.
2. Track tasks as todos; one task at a time, steps followed exactly,
   verifications actually run (see `verification-before-completion`).
3. **Stop and ask instead of guessing** when: blocked, an instruction is
   unclear, verification fails repeatedly, or reality has drifted from the
   plan. A plan is intent; the repo wins.
4. Finish with the standard session close: files changed · what ran and what
   it said · drift found (register first) · decisions still needed — and
   check off the plan's boxes so the next session sees true state.
