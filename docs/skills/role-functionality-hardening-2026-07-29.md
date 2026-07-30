# Skills: Role functionality hardening — merchant nav, founder prep, E2E roles

Date: 2026-07-29 · Session mode: **Builder** · Branch: `claude/maanta-role-hardening-62ut64`

Implementation pass following the seven-persona role/functionality review. Three
follow-ups, plus the small authorization inconsistencies found while touching
those areas.

## 1. Merchant staff nav hardening

**New `maanta-app/src/lib/merchant-nav.ts`** — the one mapping from staff
permissions to visible entry points. Everything else imports from it, so nav,
More rows, quick actions and the wallet chip can't drift apart.

```
redeem → can_verify · deals → can_deals · wallet/topup → can_topup
plan   → can_purchase · more → always (informational)
```

Applied at every entry point that previously assumed owner-level access:

| File | Change |
|---|---|
| `components/nav/bottom-bars.tsx` | `MerchantBottomBar` takes `permissions`, renders only usable tabs. Both bars gained `aria-label` ("Merchant" / "Shopper") for stable E2E selectors. |
| `merchant/(app)/layout.tsx` | Passes `permissions` to the bar and `canOpenWallet` to the top bar. |
| `components/nav/merchant-top-bar.tsx` | Balance stays visible to everyone (cashiers need arrears context); it only *links* into the wallet when `can_topup`. |
| `merchant/(app)/more/page.tsx` | Rows come from `merchantMoreRows()`. |
| `merchant/(app)/settings/page.tsx` | "Plan & billing" row gated on `can_purchase`. |
| `merchant/(app)/dashboard/page.tsx` | Quick actions filtered; the whole block hides if none apply. |
| `merchant/(app)/wallet/page.tsx` | "Top up wallet" CTA hidden without `can_topup` (ledger stays readable). |
| `merchant/(app)/deals/page.tsx` | "+", "New deal" and the empty-state CTA hidden without `can_deals`. |
| `merchant/page.tsx` | Landing redirect uses `merchantHomeHref()` instead of always `/merchant/redeem`. |

Owner behaviour is unchanged by construction — `OWNER_PERMISSIONS` is all-true,
and `src/lib/__tests__/merchant-nav.test.ts` pins the owner bar to
`Redeem · Deals · Wallet · More`.

## 2. Founder-role preparation

**Audit + extraction path: `docs/skills/founder-role-split.md`.** Verdict: do
**not** cut over now (it's a CHECK-constraint migration plus an RLS review of
every `current_user_role() = 'admin'` policy). Eight sensitive powers are
bundled into the shared `admin` role, fee reversal first among them; all are
audited to `admin_ops_log`, so the exposure is unnecessary privilege rather than
unattributable action.

**Scaffolding shipped: `maanta-app/src/lib/roles.ts`.** `OPERATOR_ROLES`,
`FOUNDER_ROLES` and `AGENT_CONSOLE_ROLES` with `isOperator` /
`hasFounderAccess` / `hasAgentConsoleAccess`. Founder and operator lists hold
the same value today but are separate knobs: the cutover becomes
`FOUNDER_ROLES = ["admin", "founder"]` in one file instead of a hunt through
eight open-coded `role !== "admin"` comparisons (`admin.ts`, `founder.ts`,
`agent.ts`, three `/agent/*` pages, `/api/leads`). `AppRole` was also declared
twice (`auth.ts`, `data.ts`); both now use the definition in `roles.ts`.
Behaviour is byte-identical — `src/lib/__tests__/roles.test.ts` pins the
allow-lists so a future split is a deliberate test change.

## 3. Playwright + Clerk role coverage

- `e2e/helpers/roles.ts` — reusable Clerk-session helpers (`asRole`,
  `expectMerchantNav`, `claimFirstDeal`, `enterCode`) and per-role
  `roleAvailable`/`skipReason`, so an unprovisioned role skips with a message
  naming the env var to set. Never a false green.
- `e2e/golden-path.spec.ts` — refactored onto the helpers; added shopper
  feed→browse→map coverage.
- `e2e/role-access.spec.ts` (new, 12 tests) — owner full console; verify-only
  staff shell and permission notices; staff+deals; shopper, staff and agent all
  barred from `/admin` + `/founder`; admin/founder smoke on `/founder` and
  `/admin/redemptions`.
- Fixtures documented in `docs/ops/e2e-golden-path.md`; two new staff storage
  states are the only accounts this adds. `role-access.spec.ts` charges nothing
  (it verifies with an invalid code deliberately).

## 4. Authorization inconsistencies fixed in passing

1. **`/merchant/topup`** rendered the amount picker for staff without
   `can_topup`; `/api/topup` then 403'd. Now a permission notice.
2. **`/merchant/plan/upgrade`** had no permission check at all. Now gated on
   `can_purchase`.
3. **Staff invite wizard** defaulted `canDeals: true` while `/api/staff`
   defaults it false — new staff silently got deal rights. Wizard is now
   verify-only, matching the API.
4. **Duplicated agent role checks** in four files now use one predicate.
5. **Shared permission notice** — `components/merchant/permission-denied.tsx`
   replaces three near-identical inline blocks (copy unchanged).

## Verification

`npm run lint` · `npm run typecheck` · `npm test` (321 passing, 47 files, +20
new) · `npm run build` — all green. `npx playwright test --list` resolves 16
tests across the two spec files.

## Follow-ups

- **Founder split** — see `founder-role-split.md` §5. Recommended end state:
  co-founder on a `founder` role, founder on `founder` + a break-glass `admin`.
- **Wallet ledger deep link** is still readable by staff without `can_topup` (by
  design — the nav entry and the action are what's gated). Revisit only if the
  ledger itself becomes sensitive.
- **E2E enablement** remains a human/ops task: a non-prod Supabase + Clerk env
  and six storage states.
