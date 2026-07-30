# Founder parity — Elite trial vs D-12 (2026-07-30)

## What shoppers / merchants should see

**Governed launch offer (live on main):**

> Launch offer: the first 100 BBS Mall merchants get a 30-day Elite trial.
> The KES 30 success fee still applies. After 30 days there is a 7-day grace,
> then Standard unless they convert.

Surfaces: `/pricing`, Elite bullet on `/for-merchants`.  
Enforcement: `elite_trial_cap_status()`, approve/grant paths, trial expiry cron.

## What D-12 banned

The **ungoverned** line “Launch offer: first month of Elite **free**”:

- no 100-cap,
- no BBS/node scope,
- implied fee waiver.

That line stays withdrawn. CI (`cash-only-and-copy.test.ts`) blocks
`first month … free` / `free month` wording only — **not** the governed
first-100 trial copy.

## How to talk about it

| Phrase | OK? |
|---|---|
| “First 100 BBS Mall merchants: 30-day Elite trial (KES 30 still applies)” | ✅ |
| “First month of Elite free” | ❌ D-12 |
| “Standard is Free” as a plan price | ❌ R-PLAN-NAMES |

See also: `docs/skills/repo-branch-audit-2026-07-30.md` §3, decisions-log
2026-07-29 (D-12) + 2026-07-30 (first-100 cap recorded).
