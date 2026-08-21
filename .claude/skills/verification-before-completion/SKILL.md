---
name: verification-before-completion
description: Use before claiming any MAANTA work is complete, fixed, green, or passing — before committing, pushing, or writing the session summary. Evidence before assertions, always.
---

# Verification Before Completion

Adapted from obra/superpowers (MIT — see `../LICENSE-superpowers.md`). This
is the skill-side enforcement of the CLAUDE.md rule: **"Never claim green
you didn't see. If a check didn't run, say it didn't run."**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If the verification command didn't run in *this* session, after the *last*
edit, the claim cannot be made.

## The gate, before any success claim

1. **IDENTIFY** — which command proves this claim? (Table below.)
2. **RUN** — the full command, fresh.
3. **READ** — full output, exit code, failure count.
4. **VERIFY** — output actually confirms the claim? If no: state the real
   status with the evidence. If yes: state the claim *with* the evidence.

## What proves what, on this repo

CI (`.github/workflows/ci.yml`) blocks on **all** of `lint`, `typecheck`,
`test`, `build`, and `db-tests`. Passing one is not passing.

| Claim | Requires (from `maanta-app/` unless noted) | Not sufficient |
|---|---|---|
| Lint clean | `npm run lint` → 0 errors | "looks fine" |
| Types clean | `npm run typecheck` → exit 0 | lint passing |
| Tests pass | `npm test` → 0 failures | a previous run, "should pass" |
| Build passes | `npm run build` → exit 0, **including** the chained `check:tokens`, `check:canonicals`, `check:forms` gates | tests passing |
| SQL / migration correct | `make db-verify` from repo root (throwaway DB + `supabase/tests/*.sql`) — **vitest proves nothing about SQL** | `npm test` green |
| Bug fixed | the original symptom's failing test now passes | code changed |
| Regression test works | red–green verified: it failed before the fix, passes after | test passes once |
| Prod behavior X is live | read-back from prod (e.g. `pg_get_functiondef`, ledger diff) — this repo's history: assumed-applied migrations drifted twice | migration file exists on `main` |
| Subagent finished the work | the actual diff / file state checked | agent's own "success" report |

Cannot run a check here (no DB, no network, CI-only gate)? Then the summary
says exactly that: "not verified: <check> didn't run" — never "should pass".

## Red flags — STOP

- "should", "probably", "seems to", "I'm confident"
- Satisfaction before verification ("Done!", "Perfect!")
- About to commit / push / summarize without a fresh run
- Trusting a subagent's success report without checking the diff
- Partial verification extrapolated to the whole ("lint passed, so build will")
- Tired and wanting the session over

## Scope of the rule

Applies to every wording that implies success — paraphrases included — and
to the mandatory session summary: the "what you ran and what it said" line
must contain only commands that actually ran, with what they actually said.
