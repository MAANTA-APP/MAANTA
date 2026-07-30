# Skills: E2E readiness implementation run (2026-07-30)

**Mode:** Builder · **Branch:** `cursor/e2e-readiness-1539` · **Baseline:** `main` @ `c9b6de4`

## One-line verdict

The money path was already E2E-capable at the RPC layer; the **operator trial path
was not honest**. This run wired the existing approve/cap/trial backend truths into
admin (and merchant plan) UI so a founder can run the first real walkthrough without
being misled.

## What was wrong (verified, not assumed)

1. `POST /api/admin/merchants/[id]/approve` already returned `notice` /
   `eliteTrialOutcome` — `merchant-admin-actions.tsx` discarded the body.
2. Migration `20260730130000` said “The admin UI reads `elite_trial_cap_status()`” —
   **zero** TS callers existed.
3. Admin merchant detail selected trial columns and never rendered them.
4. `/merchants?shop=` → onboard never read `shop`.
5. Merchant `/plan` showed “0 days left” once `trial_ends_at` passed while grace
   still kept `elite_trial_active=true`.

## What we shipped

- `src/lib/elite-trial.ts` — format/parse helpers + tests
- Approve UI shows outcome InlineAlert; pre-warns when cap exhausted
- Cap line on merchant detail approve + `/admin/billing`
- Trial / grace / slot-consumed lines on admin merchant detail
- Onboard prefills shop name from `?shop=`
- Merchant plan grace-aware label (`grace_period_ends_at` on `MerchantRow`)

## What we deliberately did not ship

Redesigns, new dashboards, Playwright secret provisioning, migration apply to
prod, pause-gate SQL fix, phone handoff from `/merchants`, public-nav polish.

## How to continue

1. Founder runs `docs/ops/founder-e2e-checklist-2026-07-30.md`.
2. Human applies any missing 07-30 migrations; record `elite_trial_cap_status()`.
3. Bucket 2 items stay open until pilot (cron, demo posture, paused-deal claim).

## Artifacts

| Doc | Path |
|---|---|
| Readiness report | `docs/ops/e2e-readiness-report-2026-07-30.md` |
| Founder checklist | `docs/ops/founder-e2e-checklist-2026-07-30.md` |
| Verification log | `docs/ops/e2e-verification-log-2026-07-30.md` |
| Prior truth audit | `docs/skills/truth-audit-2026-07-30.md` |
