# E2E readiness — technical verification log (2026-07-30)

Branch: `cursor/e2e-readiness-1539` · Baseline: `main` @ `c9b6de4`

---

## Files / routes inspected

### Public / acquisition
- `maanta-app/src/app/(public)/page.tsx` — landing CTAs
- `maanta-app/src/app/(public)/for-merchants/page.tsx` — door + opening credit + plans
- `maanta-app/src/app/(public)/merchants/page.tsx` — lead form → login next
- `maanta-app/src/app/(public)/pricing/page.tsx` — launch offer copy
- `maanta-app/src/lib/__tests__/pricing-copy.test.ts` — commercial copy ratchet

### Merchant
- `maanta-app/src/app/merchant/onboard/page.tsx` + `onboard-wizard.tsx`
- `maanta-app/src/app/merchant/(app)/plan/page.tsx`
- `maanta-app/src/lib/merchant.ts`, `maanta-app/src/lib/data.ts` (`MerchantRow`)

### Admin
- `maanta-app/src/app/api/admin/merchants/[id]/approve/route.ts`
- `maanta-app/src/app/admin/merchants/[id]/merchant-admin-actions.tsx` (pre: ignored body)
- `maanta-app/src/app/admin/merchants/[id]/page.tsx` (pre: selected trial, no render)
- `maanta-app/src/app/admin/billing/page.tsx` + `plan-actions.tsx`
- `maanta-app/src/app/api/admin/plans/[id]/route.ts` (direct grant-trial → 409 at cap)

### Money / flags
- `maanta-app/e2e/golden-path.spec.ts`, `docs/ops/e2e-golden-path.md`
- `docs/ops/demo-mode.md`, `docs/maanta-node0-rehearsal-checklist.md`
- `docs/skills/truth-audit-2026-07-30.md`, `docs/skills/full-state-audit-2026-07-29.md`

---

## Migrations reviewed

| Migration | Relevance |
|---|---|
| `20260702094145` + `20260730120000` | KES 30 fee pin + notes |
| `20260703190627` | Zero-balance gate |
| `20260701110443` / `01111223` / `29092118` / `30140000` | Trial grace + cron + NULL sentinel |
| `20260716084804` + `30130000` | Opening credit + elite trial first-100 cap (`activate_merchant`, `elite_trial_cap_status`) |
| `20260720120000` | Claim/verify/activate hardening |
| `20260721140000` | Current `verify_redemption` |
| `20260730150000` | Demo wipe audit retention |

---

## Queries for the founder / operator

```sql
-- Launch-offer slots (authoritative)
SELECT * FROM public.elite_trial_cap_status();

-- Demo posture
SELECT key, value, notes FROM public.app_config
 WHERE key IN (
   'demo_mode_enabled',
   'elite_trial_merchant_cap',
   'node0_opening_credit_kes',
   'node0_opening_credit_merchant_cap',
   'node0_launch_node',
   'node0_launch_period_ends_at',
   'success_fee_kes'
 );

-- Pending merchants for approval rehearsal
SELECT id, merchant_name, status, tier, elite_trial_active, trial_ends_at,
       grace_period_ends_at, elite_trial_granted_at, account_balance, node
  FROM public.merchants
 WHERE status = 'pending'
 ORDER BY created_at DESC
 LIMIT 20;

-- Trial expiry job present? (prod dashboard / cron.job)
SELECT jobname, schedule, command FROM cron.job
 WHERE jobname = 'maanta_handle_trial_expiry';
```

---

## Tests run (this branch)

```text
cd maanta-app && npm test
# 49 files / 383 tests passed

cd maanta-app && npm run typecheck
# clean
```

New: `src/lib/__tests__/elite-trial.test.ts` (11 cases) — cap line, approve
outcome messages, grace label, RPC payload parse.

SQL suites not re-executed in this cloud pass (UI-only delta). Prior truth audit
confirmed migrations + SQL suites against a local Postgres shim.

---

## Assumptions still unverified

1. Prod migration apply status for 2026-07-30 files (human).
2. Live cap backfill count on `axrrslqssmbngbataejg`.
3. Interactive Clerk browser path in this agent VM (placeholder keys → no UI E2E).
4. `MAANTA_DEMO_MODE` Vercel env vs DB `demo_mode_enabled`.
5. Whether `claim_deal` pause-gate regression is hit in rehearsal (no paused deals in seed path).
6. SMS notification on approve (copy says notified; deliverability not verified here).
