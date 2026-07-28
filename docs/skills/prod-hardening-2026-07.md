# Production hardening pass — skills pointer

**Last updated:** 2026-07-28

## What changed in-repo

- `/app-bootstrap` is strategy-aware (Clerk vs Supabase session detection).
- `src/lib/env.ts` — env catalog + strategy-aware critical checks.
- `readiness()` / `/api/healthz?ready=1` respects auth strategy (Clerk keys not required in supabase mode).
- Soft env warning on instrumentation register.
- Operator docs: prod sync, Vercel env, monitoring, smoke, launch runbook, founder checklist, data governance gaps.
- `make db-migration-checklist` prints human-run migration steps.

## Start here

| If you need… | Open |
|---|---|
| Launch day sequence | `docs/ops/launch-runbook-2026-07.md` |
| What only the founder can do | `docs/ops/founder-manual-actions-checklist-2026-07.md` |
| Full company audit | `docs/ops/maanta-comprehensive-audit-2026-07.md` |
| Migrations | `docs/ops/supabase-migrations.md` |

## Candid status

Repo-side hardening is done. **Production is still unsafe until human migration + Vercel env + smoke steps complete.**
