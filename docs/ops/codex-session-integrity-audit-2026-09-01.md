# Codex session integrity audit — 2026-09-01

**Question asked:** did a Codex working session undo the work that got MAANTA to
the Node 0 pilot gate?

**Answer: no.** Nothing was reverted, deleted, or applied out of band. Every
guard, migration and pilot counter is where the documentation says it should be.
This note records the evidence so the question does not have to be re-asked from
memory.

## What was checked, and what it returned

| Check | Method | Result |
|---|---|---|
| Working tree | `git status --short` | Clean — no uncommitted or lost edits |
| Branch vs origin | `git rev-list --left-right --count origin/main...HEAD` | `0 0` — HEAD, `origin/main` and the working branch are the same commit, `7e59410` |
| Deletions | `git log --diff-filter=D --since=2026-08-27` | **Zero** files deleted |
| Reverts | `git log --grep=revert -i` | **Zero** revert commits in the entire history |
| Guard tests | Existence check on the 9 named guards | All present; `src/lib/__tests__/` holds 124 files |
| Build gates | `package.json` `build` script | Still chained: `next build && check:tokens && check:canonicals && check:forms` |
| Lint | `npm run lint` | Pass — no ESLint warnings or errors |
| Typecheck | `npm run typecheck` | Pass — exit 0 |
| Tests | `npm test` | **174 files, 1725 tests, all passing** |
| CI on `main` | GitHub Actions run `33494100667` | Both jobs green: `ci` (lint/typecheck/test/build) and `db-tests` (fresh Supabase, full chain, `supabase/tests/*.sql`) |
| Production deployment | Vercel `dpl_F5Cpstf6oWAGpPdw9azY2P7Zbcyd` | `target: production`, `READY`, ref `main`, commit `7e59410`, verified signature, deployed 2026-09-01 09:48 UTC |
| Migration ledger | Full version+name diff, prod `schema_migrations` vs `supabase/migrations/` | **Exact 107/107 match**, high-water `20260830120000` on both sides |
| Pilot counters | Join-through-parent query (CLAUDE.md canonical form) | Unchanged: genuine merchant successes **1** (internal E2E survivor), non-demo merchant records **2**, demo mode **on** |

## What the Codex session actually did

Between **20:14 and 20:34 UTC on 2026-09-01** it produced roughly forty Vercel
deployments. Every one is a **preview** (`target: null`) from two feature
branches, `codex/queue-call-schema` and `codex/queue-call-app`, across PRs
**#301–#313**. The work is a merchant queue call-forward feature — staff calls a
shopper forward, the shopper gets an alert, and an expired call slot is released
and must be explicitly rejoined.

**None of it reached `main`, production, or the production database.** Only PR
[#313](https://github.com/maanta-app/maanta/pull/313) remains open; the rest were
superseded rather than merged. The last commit on `main` is still `7e59410`
(D169 closure), and the last production deployment is that same commit, deployed
from `main` by the normal pipeline — **not** a manual branch promote, so the
D53/D71 failure mode did not recur.

## Why the fear was reasonable but wrong

The signal that reads as alarm — dozens of deployments in twenty minutes,
touching queue, money-adjacent and schema files — is preview churn from an
iterating agent, not production change. Two facts separate the two cases, and
both are cheap to re-check:

1. `target` on a Vercel deployment. `null` is a preview and reaches nobody;
   `"production"` is the live site.
2. `supabase_migrations.schema_migrations` on production. It is the only
   authority on what the database actually runs — the repo directory is not,
   and neither is a branch.

## Standing note

The pilot gate is exactly where the 2026-08-27 checkpoint left it, with the two
later migrations (`20260829120000`, `20260830120000`) applied and reconciled.
**External field validation remains 0 genuine merchants and 0 genuine merchant
successes** — that counter is unmoved because no field work has happened, not
because anything was lost.

PR #313 is unreviewed feature work that arrived during Node 0 Field Validation
Mode, where product and engineering are frozen absent field evidence. Whether it
lands is a founder decision, not a maintenance one.
