# Agent screens polish — 2026-08-21

Follow-up to `admin-ui-polish-2026-08-20.md`, which fixed the agent loading
skeleton but only skimmed the agent surfaces themselves. Dedicated pass over
`/agent` (field-rep console + co-founder pipeline view), `/agent/leads`,
`/agent/leads/[id]` + `link-merchant`, `/agent/leads/new`.

## Audit verdicts

This family audits unusually well — it already models the patterns the earlier
passes had to introduce elsewhere:

| Guideline | Verdict |
|---|---|
| Read failure ≠ empty state | PASS — `LeadsReadError` (shared, `role="alert"`, icon + ink word) on the console, pipeline view and leads list; the docblocks name the exact lie each one prevents |
| One display rule, one place | PASS — `LeadRowList`/`isLockLive` deduplicate the lock-live condition three screens share |
| Attribution boundaries honest | PASS — G4 candidates limited to the agent's own unlinked shops; G1 handoff copy tells the agent to hand the device to the owner; single amber per screen with the ghost/amber split commented |
| Role-appropriate views | PASS — co-founder gets a pipeline view, not a broken rep console |
| Errors announced | **Fixed** — the two client actions (`new-lead-form`, `link-merchant`) rendered error text without `role="alert"` |
| Selection perceivable | **Fixed** — `link-merchant`'s candidate picker marked selection with an `aria-hidden` dot only; buttons now carry `aria-pressed` |
| Honest numbers | **Fixed** — the weekly-target bar divided by `weekly_target` unguarded: a zero target painted a full bar over "0 / 0 shops"; now renders empty |

## Changes

- `src/app/agent/leads/new/new-lead-form.tsx` — error announces.
- `src/app/agent/leads/[id]/link-merchant.tsx` — error announces;
  `aria-pressed` on candidate buttons.
- `src/app/agent/page.tsx` — zero-target guard on the progress bar width.
- `src/components/__tests__/admin-ui-polish.test.ts` — two new ratchets
  covering all three fixes.

## Verification

From `maanta-app/`: `npm run lint` clean · `npm run typecheck` clean ·
`npm test` 116 files / 989 tests passed · `npm run build` passed with all
three post-build gates clean.

## Drift

None — unclaimed polish debt only; no register rows opened.

## Open decisions

None. With this, every role surface in the product has had its pass: shopper,
merchant (app + onboard), admin, agent, founder (shares the admin bar and was
covered in that audit), marketing.
