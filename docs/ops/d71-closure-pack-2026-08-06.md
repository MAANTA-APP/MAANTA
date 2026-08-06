# D71 closure pack — paste-ready texts (2026-08-06)

Founder chose Option A with a light B: close D71 on the ruling that
**detection + policy is the accepted standing guard**, never claiming Vercel
can prevent a non-main Promote. This file contains the three texts to paste.
Nothing here has been applied — the register, the decisions log and CLAUDE.md
are untouched by this session.

**Sequencing — do not paste until both are true:**

1. Vercel → `maanta-nuia` → Settings → Git → Production Branch reads `main`
   (confirm, record the date).
2. The promote-rights / token audit is actually done (Team Settings → Members:
   every account that should not ship production moved to a role without
   promote rights; deploy-capable API tokens held by agents/automation revoked
   or scoped; record the date).

Fill every `2026-08-__` placeholder with the real dates. The row cites
`maanta-app/src/lib/__tests__/health.test.ts` and
`.github/workflows/prod-branch-guard.yml`, both verified to exist and to
assert what the row claims (checked 2026-08-06: healthz is `force-dynamic`,
`ref` returned verbatim-or-null and test-covered; the workflow fails on
`ref != main`, missing ref, non-2xx, and unreachable healthz; cron `*/30` plus
manual dispatch). No code changes were needed — implementation matches the
intended ruling.

---

## 1. Updated D71 row (replace the existing row's status + evidence cell; claim cell unchanged)

| D71 | closed | process | 2026-08-04 | Ops | **Fourth branch-promote to production, and the first caught while live.** At 15:09 UTC deployment `dpl_7tkPxRZ8dt7wej3kspDFs5RDxjya` was promoted to production (`action: promote`, `target: production`) from `cursor`-style branch ref `claude/install-superpowers-plugin-na574p` at `6e817424` — an **open, unmerged PR** (#172) — and by 15:11 it was serving `www.maanta.app`. The last production deployment from `main` is `dpl_6Eu3Vf3jxgQRZQoB` at `fb681bb4` (the #171 squash merge). The deployment list also still shows `dpl_8VVhSaarcgajWvQi`, a promote of `claude/scaling-costs-security-audit-vfcp97` at `2ed98ade` — the release tag on the D70 Sentry events, which is how a defect from an unmerged branch reached real shoppers. **D37** closed on the finding that production served `main`; **D53** recorded occurrences two and three and called alignment "a thing to check, not a state to assume". This is the fourth, so the pattern is not incidental: nothing in the repo or in CI can prevent it, because a dashboard promote bypasses both | **Production restored 2026-08-04 17:14 UTC**: `main` @ `e167c3d1` (the #172 squash) promoted, verified against the Vercel deployment. **Prevention confirmed unavailable (2026-08-05)**: `POST /v10/projects/{id}/promote/{deploymentId}` accepts any READY deployment, no project setting restricts Promote, and promote rights are team RBAC only — so the standing guard is **detection plus policy, not prevention: a non-main Promote will still succeed; it will be seen within ~30 minutes and treated as an incident**. The tripwire: (1) `GET /api/healthz` exposes the build's git `ref` (a promote does not rebuild, so a promoted preview keeps the branch ref it was built from) — `maanta-app/src/lib/health.ts`, contract asserted by `maanta-app/src/lib/__tests__/health.test.ts` (ref verbatim, never normalized, null when unset); (2) `.github/workflows/prod-branch-guard.yml` polls production every 30 minutes (plus manual dispatch) and fails loudly when `ref != main`, when `ref` is missing (the guard cannot see), and when healthz is unreachable or non-2xx. Preview-URL side exposure closed 2026-08-05 (Vercel Authentication, `all_except_custom_domains`). Dashboard work completed before closure: Production Branch confirmed `main` on 2026-08-__; promote rights and deploy-capable API tokens audited on 2026-08-__. **Closed 2026-08-__ by founder ruling** (decisions-log entry of the same date): tripwire + branch confirmation + rights audit + preview-URL protection is the accepted standing guard, with the promote policy recorded in `docs/maanta-launch-ops-runbook.md` §"Production deployments and Promote" — Promote only from `main`; curl healthz after; any non-main Promote is an incident and gets a drift-register row. Guard: `.github/workflows/prod-branch-guard.yml` + `maanta-app/src/lib/__tests__/health.test.ts` + the decisions-log entry. Known limits, recorded rather than papered over: detection lags up to ~30 minutes; the tripwire depends on healthz staying public and on GitHub cron staying enabled (schedules suspend after ~60 days of repo inactivity); the rights audit is point-in-time — re-audit when membership or tokens change. When auditing what production serves, compare **trees, not commit SHAs** — a squash merge mints a new SHA | founder |

## 2. Decisions-log entry (append to "Recent decisions"; then update "Last updated" and mirror to Notion)

| 2026-08-__ | **D71 closed by ruling: the branch-promote guard is detection + policy, not prevention — and that is the accepted standing guard.** Verified before closing: Vercel Production Branch = `main` on project `maanta-nuia` (checked 2026-08-__); promote rights and deploy-capable API tokens audited 2026-08-__. Vercel cannot block a non-main Promote — the promote endpoint accepts any READY deployment and no project setting restricts it — so MAANTA claims detection, never prevention. Standing guard: `/api/healthz` exposes the serving build's git `ref`; `prod-branch-guard` fails loudly within ~30 minutes on `ref != main`, a missing ref, or unreachable healthz. Promote policy, binding on anyone with promote rights: **Promote only from `main`; after any Promote, `curl -s https://www.maanta.app/api/healthz` and confirm `"ref":"main"`; any non-main Promote — including a well-intentioned one that "worked" — is an incident: roll back to the newest READY `main` deployment and add a drift-register row** | Closes drift **D71** (fourth branch-promote, 2026-08-04; pattern D37/D53). Guard: `.github/workflows/prod-branch-guard.yml`, `maanta-app/src/lib/__tests__/health.test.ts`, and §"Production deployments and Promote" in `docs/maanta-launch-ops-runbook.md`. Stated limits: detection ≤ ~30 min, not zero; GitHub cron suspends after ~60 days of repo inactivity; the rights audit is point-in-time — re-run it on any membership or token change |

## 3. Ops runbook section (add to `docs/maanta-launch-ops-runbook.md`, e.g. after "Public / infrastructure")

```markdown
## Production deployments and Promote

Production must always serve a build of `main`. Vercel cannot enforce this —
the Promote action accepts any READY deployment, and four branch promotes have
reached production (most recent 2026-08-04, drift D71) — so this section is the
rule and the tripwire is the check. This is detection, not prevention: a
non-main Promote will succeed; it will be caught and treated as an incident.

- **Promote only from `main`.** Never promote a preview/branch deployment to
  production — not briefly, not to "test something live". If a change needs
  production, merge it first.
- **After any Promote or rollback**: `curl -s https://www.maanta.app/api/healthz`
  and confirm `"ref":"main"` and the expected `commit`. When comparing what
  production serves against the repo, compare trees, not commit SHAs — a
  squash merge mints a new SHA.
- **The tripwire**: `.github/workflows/prod-branch-guard.yml` checks production
  every 30 minutes and goes red when the ref is not `main`, when the ref is
  missing, or when healthz is unreachable. A red run is an incident, not noise.
- **If a non-main Promote happens** — by anyone, for any reason, even if the
  promoted build works: roll back in the Vercel dashboard (Deployments → the
  newest READY `main` deployment → ⋯ → Promote to Production), verify healthz,
  then add a drift-register row recording who, what and when.
- **Rights hygiene**: promote ability is Vercel team RBAC only. Re-run the
  promote-rights and token audit whenever team membership changes or a new
  deploy-capable token is minted.
```
