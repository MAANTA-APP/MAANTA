# E2E readiness report — 2026-07-30

**Mode:** Builder (implementation for end-to-end testing readiness)  
**Branch:** `cursor/e2e-readiness-1539`  
**Baseline HEAD before branch:** `main` @ `c9b6de4` (Merge PR #140 demo-wipe audit retention)  
**Method:** verify from repo/code/SQL/docs first; implement only Bucket-1 (and one cheap Bucket-2 honesty fix).

---

## 1. What was verified (before changing code)

| Area | Verdict |
|---|---|
| Public acquisition (`/`, `/for-merchants`, `/merchants`, `/pricing`) | Present; launch-offer + fee copy aligned after 2026-07-30 truth audit |
| Merchant onboard wizard | Runnable; `?shop=` from `/merchants` was **dropped** (not read) |
| Admin approve API | Returns `eliteTrialGranted` / `eliteTrialOutcome` / `notice` correctly |
| Admin approve UI | **Ignored** response body — silent close + refresh |
| `elite_trial_cap_status()` | Exists in SQL; **no TS caller** (migration comment claimed admin UI reads it — false) |
| Admin merchant detail | Selected `elite_trial_active` / `trial_ends_at` but **did not render** them |
| Merchant plan page | Showed “0 days left” during grace (misleading) |
| Money path claim→verify→KES 30 | SQL golden path + API wired; Playwright suite exists but self-skips |
| Demo mode | DB `demo_mode_enabled` fail-safe OFF in seed; prod may still be ON (human confirm) |
| Migrations through `20260730150000` | In repo; **prod apply of 07-30 migrations is human-owned** (truth-audit FU-2) |

There is **no** `frames.json` / R-xxxx drift register. Source of truth for this run: code, migrations, `docs/skills/truth-audit-2026-07-30.md`, `docs/maanta-node0-rehearsal-checklist.md`, `docs/ops/e2e-golden-path.md`.

---

## 2. Classification

### Bucket 1 — Blocks E2E now (fixed in this branch)

1. **Approve UI discarded trial outcome notices** — admin could tick “Grant Elite trial”, get Standard (cap full or unknown), and never see it. Invalidates the trial leg of the first E2E.
2. **`elite_trial_cap_status` unused by UI** — operator could not see remaining slots before approving.
3. **Admin merchant detail hid trial fields** — after approve, founder could not confirm trial/grace on the same screen.
4. **`/merchants` → onboard dropped shop name** — signup handoff looked broken / forced re-entry.

### Bucket 2 — Required before pilot, not before first E2E

| Item | Notes |
|---|---|
| Confirm 07-30 migrations applied on prod | Cap + fee-notes + trial-sentinel + demo-wipe retention |
| Confirm `demo_mode_enabled` posture | Rehearsal may stay ON; must be OFF at public launch |
| Confirm `pg_cron` `maanta_handle_trial_expiry` | Trials never grace/downgrade without it |
| `/merchants` phone still unused | Phone re-collected in onboard; non-blocking |
| Opening credit only marketed on `/for-merchants` | Granted at activate; wallet shows balance quietly |
| Paused-deal claim gate missing in `claim_deal` | SQL footgun if deals are paused during rehearsal |
| Dedicated non-prod Playwright env | Tracker E14 — opt-in suite still needs secrets |

### Bucket 3 — Post-E2E / polish (not touched)

Public nav “For merchants”, Elite upgrade payment rail, analytics dual-switch hygiene, command palette / dashboards, branding refresh, Playwright CI gating as merge blocker.

---

## 3. What changed

| Change | Why |
|---|---|
| `src/lib/elite-trial.ts` + 11 unit tests | Single place for cap/outcome/grace copy; ratchets operator honesty |
| Admin approve modal/actions render API `notice` + synthesised outcome | Stops silent “trial granted” lies |
| Cap line on approve + `/admin/billing` via `elite_trial_cap_status()` | Matches migration claim; founder sees slots |
| Admin merchant detail renders trial / grace / slot-consumed | Post-approve verification on the same page |
| Onboard prefills `?shop=` | Closes signup handoff hole |
| Merchant `/plan` uses grace-aware label | Stops “0 days left” during grace |

**Not changed:** business rules, fee amount, trial length, cap size, money RPCs, feed sort, demo wipe, Playwright secrets, Vercel/Supabase config.

---

## 4. Verification of this branch

- `npm test` — **49 files / 383 tests pass** (was 326+ before; +11 elite-trial)
- `npm run typecheck` — clean
- SQL suites — not re-run here (no Docker in this pass); money path already covered on `main`; this PR is UI/operator surface only

---

## 5. Still unverified (do not assume)

- Whether prod has migrations `20260730120000`–`20260730150000` applied
- Live `SELECT * FROM elite_trial_cap_status()` on prod after backfill
- Whether Vercel Production env matches founder checklist
- Whether Clerk interactive browser works with current keys in this cloud VM (placeholder keys block UI E2E here)
- Whether `MAANTA_DEMO_MODE` env matches `app_config.demo_mode_enabled`

See companion docs:

- Founder walkthrough: `docs/ops/founder-e2e-checklist-2026-07-30.md`
- Technical log: `docs/ops/e2e-verification-log-2026-07-30.md`
- Skills handoff: `docs/skills/e2e-readiness-2026-07-30.md`
