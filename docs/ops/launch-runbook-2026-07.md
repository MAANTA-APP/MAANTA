# Launch runbook — 2026-07

**Audience:** Founder + engineer on launch / pilot day  
**Keep short. Follow in order. Link out for detail.**

```
Pre-checks → DB → Env → Deploy → Monitoring → Smoke → Watch
```

---

## Linked docs (open these tabs)

| Doc | Use |
|---|---|
| `docs/ops/prod-sync-checklist-2026-07.md` | Full sync |
| `docs/ops/supabase-migrations.md` | Migration CLI + SQL verify |
| `docs/ops/vercel-production-env-checklist.md` | Env matrix |
| `docs/ops/monitoring-launch-checklist.md` | Sentry / PostHog |
| `docs/ops/production-smoke-test.md` | Device smoke |
| `docs/ops/founder-manual-actions-checklist-2026-07.md` | What only you can do |
| `docs/maanta-production-rollout-plan.md` | Drift / Phase A–F history |
| `docs/maanta-launch-ops-runbook.md` | Weekly ops + disputes |

---

## A. Pre-deploy checks (same day)

- [ ] `main` (or release commit) is green in CI (lint, typecheck, vitest, build, db-tests)
- [ ] No known money-path regressions open
- [ ] Confirm target Supabase ref = `axrrslqssmbngbataejg` on Vercel Production
- [ ] Decide: seed 100 deals on prod? (demo yes / live merchants maybe no)
- [ ] Support channel ready (WhatsApp / phone) — even if informal

## B. Migrations (DB first)

```bash
# From repo root — HUMAN with credentials
make db-migration-checklist   # prints steps; no network
make db-link
make db-list
make db-push-dry
# backup / PITR if uneasy
make db-push
# then verification SQL in docs/ops/supabase-migrations.md §5
```

- [ ] No unexpected REMOTE-only versions without a repo file
- [ ] Hardening / Guardian / fee_reversals objects present

## C. Env verification

- [ ] Follow `vercel-production-env-checklist.md`
- [ ] Strategy pair = `clerk` / `clerk`
- [ ] Clerk Production keys (not mismatched publishable/secret)
- [ ] `NEXT_PUBLIC_APP_URL=https://www.maanta.app`
- [ ] Resend vars if waitlist is in campaign

## D. Deploy

- [ ] Merge/promote release to Production on Vercel
- [ ] If env changed: **Redeploy** (especially after `NEXT_PUBLIC_*`)
- [ ] `curl -sS https://www.maanta.app/api/healthz?ready=1` → ready

## E. Monitoring

- [ ] Sentry DSN set → sample error received **or** known deferral
- [ ] PostHog tokens set → pageview received **or** known deferral
- [ ] Uptime probe on `/api/healthz`

## F. Post-deploy smoke (minimum)

From `production-smoke-test.md`, at least:

1. Landing + `/download`
2. Shopper login → `/feed`
3. Claim (with phone) → ticket
4. Merchant verify → fee/arrears
5. Admin queue loads

## G. Rollback / containment

| Problem | Action |
|---|---|
| App 500s after deploy | Instant rollback to previous Vercel deployment |
| Money-path broken | Rollback app; **do not** invent ad-hoc SQL — fix via migration |
| Migrations applied but code old | Prefer forward-fix migration; avoid manual DROP |
| Auth broken (Clerk) | Check keys + strategy pair; redeploy |
| Feed empty | Check `maanta_node`, seed, migration lat/lng, service role |
| Webhook storm | Disable Stripe/IntaSend endpoint temporarily; inspect `payment_webhook_failures` |

Migrations are **forward-only**. There is no automatic DB rollback. Prefer app rollback + forward fix.

## H. Launch-day watch items

| Window | Watch |
|---|---|
| First hour | Sentry issues, healthz, claim/verify errors |
| First day | Arrears accumulation, dispute queue, waitlist delivery |
| First week | Merchant onboarding questions (O2), BBS operator feedback (O4) |
| Ongoing | Trial expiry job actually running (E11) |

## I. Explicit non-goals for launch day

- Do **not** negotiate Oracle/data-partner DPAs on launch day
- Do **not** switch payment processors mid-traffic
- Do **not** run SQL test suites against production
- Do **not** enable `STRIPE_ENV=live` without a cutover plan

---

## Done criteria (pilot)

- [ ] Golden path works on two real phones at BBS Mall
- [ ] At least one live (non-seed) merchant verified a real redemption **or** rehearsal signed off intentionally
- [ ] Monitoring or explicit deferral documented
- [ ] Founder knows dispute path (72h SLA)
