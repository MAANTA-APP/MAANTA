# MAANTA drift register

Last updated: 2026-07-30

The single durable record of **known gaps between what MAANTA claims and what is
true**, with open/closed state per row. Created 2026-07-30 to close FU-1 of
`docs/skills/truth-audit-2026-07-30.md`.

## Why this file exists

Before it, drift was recorded in dated audit documents (`docs/skills/*-audit-*.md`).
Those are good narratives and bad trackers: nothing carries state forward, so a
finding resolved in one audit can be re-raised or forgotten in the next. That is
not hypothetical — it is what happened:

- The Elite-trial "14 vs 30 days" conflict was resolved on 2026-07-29, and a code
  comment still called it open on 2026-07-30 (**D5**).
- The launch offer was frozen in Notion and had never reached the repo mirror at
  all, despite being referenced in passing by another decisions-log entry (**D6**).
- Two invariants this repo described as enforced were not (**D3**, **D9**).

So the register's job is not to be tidy. It is to make *"we already fixed that"*
a checkable claim.

## The rules

1. **Rows are append-only.** Never delete or renumber a row — close it. The
   history of what was once wrong is the point.
2. **A row may only be `closed` when its evidence names a guard** — a test, a
   migration, or a decisions-log entry: something that would fail or be
   contradicted if the drift came back. `drift-register.test.ts` fails if the
   cited path does not exist, and fails if the only citation is a document the
   row merely relates to.

   Some drift cannot be guarded — a misleading comment, or behaviour that needs
   test infrastructure this repo lacks. Those may still close, but the evidence
   must say **`no guard: <reason>`** so it is a visible choice. The first draft of
   this register did not have that rule, and an open row flipped to `closed`
   passed the suite because it happened to cite a background doc. That hole was
   found by trying it.
3. **`pending-deploy` is not `closed`.** A fix merged to `main` but not yet live
   (an unapplied migration, an unset env var) stays open in substance. This
   distinction exists because "merged" is the exact point at which people stop
   tracking things.
4. **`deferred` needs an owner and a next step**, not just a shrug.
5. Every audit that finds drift adds rows here **before** writing its narrative,
   and closes prior rows by ID rather than re-describing them.

### Status values

| Status | Meaning |
|---|---|
| `open` | The gap exists right now. |
| `pending-deploy` | Fix is merged but not yet live where it counts. Still a gap. |
| `closed` | Fixed, live, and evidenced. |
| `deferred` | Accepted knowingly, with an owner and a trigger for revisiting. |

### Category values

`code-outlier` · `mirror-stale` · `doc-stale` · `db-metadata` · `product-decision` · `prototype-only` · `process`

---

## Register

| ID | Status | Category | Opened | Domain | Claim vs reality | Evidence / next step | Owner |
|---|---|---|---|---|---|---|---|
| D1 | closed | product-decision | 2026-07-30 | Feed ordering | Frozen feed rule locks three per-rail sorts; `/feed` defaulted to distance and re-sorted all three, discarding the boosted order Elite merchants pay KES 500/24h for | `maanta-app/src/lib/deal-list-controls.ts`, `maanta-app/src/lib/__tests__/locked-feed-order.test.ts`, `docs/maanta-decisions-log.md` | founder |
| D2 | pending-deploy | product-decision | 2026-07-30 | Trials / money | Frozen launch offer is capped at the first 100 BBS Mall merchants; nothing enforced the cap or the node scope | Enforced by `maanta-app/supabase/migrations/20260730130000_enforce_elite_trial_first_100_cap.sql` + `maanta-app/supabase/tests/elite_trial_cap_test.sql`. **Not live until a human runs `supabase db push`** — see D10 | founder |
| D3 | closed | doc-stale | 2026-07-30 | Feed ordering | Notion "Frozen Scope and Rules" claimed the feed structure was "enforced in code", citing a test file that never covered it | Notion bullet corrected with a dated sub-note; now cites `maanta-app/src/lib/__tests__/locked-feed-order.test.ts` | founder |
| D4 | closed | code-outlier | 2026-07-30 | Pricing copy | `/pricing` promised "first month of Elite free" — no cap, no node scope, no fee caveat — against a frozen offer that has all three | `maanta-app/src/app/(public)/pricing/page.tsx`, guarded by `maanta-app/src/lib/__tests__/pricing-copy.test.ts` | founder |
| D5 | closed | mirror-stale | 2026-07-30 | Trials | A code comment called the 14-vs-30-day trial conflict "an open spec/DB conflict" after the 2026-07-29 audit had already resolved it to 30 days. First recorded re-discovery | Corrected in `maanta-app/src/app/api/admin/merchants/[id]/approve/route.ts`. no guard: a test cannot assert that prose is not misleading; the 30-day value itself is covered by `maanta-app/supabase/tests/elite_trial_cap_test.sql` | eng |
| D6 | closed | mirror-stale | 2026-07-30 | Trials | The launch offer was a frozen rule in Notion and appeared nowhere in the repo mirror, though another decisions-log entry referenced it in passing | `docs/maanta-decisions-log.md` | eng |
| D7 | closed | code-outlier | 2026-07-30 | Pricing copy | "Free" rendered as Standard's headline price, while a Standard merchant pays the success fee on every verified redemption | Copy fixed on both public pages and guarded by the bare-"Free" check in `maanta-app/src/lib/__tests__/pricing-copy.test.ts` | founder |
| D8 | closed | code-outlier | 2026-07-30 | Pricing | The frozen success fee existed as four independent `30` literals across public pages, page metadata and a fallback | Single-sourced as `SUCCESS_FEE_KES` in `maanta-app/src/lib/pricing.ts`; uniqueness asserted by `maanta-app/src/lib/__tests__/pricing-copy.test.ts` | eng |
| D9 | pending-deploy | db-metadata | 2026-07-30 | Pricing | Live `app_config.success_fee_kes` notes gave the Elite price review as "Oct 2026" (superseded by the 2026-07-20 ruling) and cited two files that do not exist in this repo | `maanta-app/supabase/migrations/20260730120000_correct_success_fee_config_notes.sql` + `maanta-app/supabase/tests/frozen_commercial_config_test.sql`. **Not live until pushed** — see D10 | eng |
| D10 | open | process | 2026-07-30 | Ops | Two merged migrations are not applied to production, so D2 and D9 are merged-but-not-true | Run `supabase db push` per `docs/ops/supabase-migrations.md`, then `SELECT * FROM public.elite_trial_cap_status();` and record the spent-slot count against D2. Claude Code must not do this | founder |
| D11 | closed | code-outlier | 2026-07-30 | Feed ordering | An unrecognised `?sort=` reached the distance branch, undoing the D1 locked order from a URL; an unrecognised `?filter=` emptied every rail and claimed the mall had no deals | `parseDealListSort` / `parseDealListFilter` in `maanta-app/src/lib/deal-list-controls.ts`, covered by `maanta-app/src/lib/__tests__/locked-feed-order.test.ts` | eng |
| D12 | closed | code-outlier | 2026-07-30 | Trials / money | The D2 cap was gated on UPDATE only, so an INSERT carrying a trial bypassed it unstamped — which `node0_rehearsal_seed.sql` actually does — making the slot count under-report permanently | Trigger widened to `BEFORE INSERT OR UPDATE`; Scenario H in `maanta-app/supabase/tests/elite_trial_cap_test.sql` | eng |
| D13 | closed | code-outlier | 2026-07-30 | Audit trail | The approve route logged the trial *request* as the outcome, so a refused or unverifiable grant was recorded as granted | Three explicit outcomes in `maanta-app/src/app/api/admin/merchants/[id]/approve/route.ts`. no guard: asserting the logged outcome needs a route-level integration test against a live Supabase, which this repo does not have yet — same blocker as the browser golden-path item in the decisions log | eng |
| D14 | open | process | 2026-07-30 | Demo mode | `app_config.demo_mode_enabled` is `true` on production (correct for rehearsal; its own notes say it must be false at launch), and the paired `MAANTA_DEMO_MODE` Vercel var that tags analytics cannot be read from a Claude session, so the two can drift unnoticed | Verify both before launch and record here; background in `docs/ops/demo-mode.md` and `docs/ops/optruth-demo-release-2026-07-29.md` | founder |
| D15 | deferred | doc-stale | 2026-07-30 | Pricing | `/pricing` hardcodes KES 3,500 with no `app_config` key behind it, unlike the success fee and boost fee, so the UI is the only place a price change lands | Add `elite_subscription_kes` when subscription billing is wired to a processor. Revisit at the Feb 2027 Elite price review | eng |
| D16 | closed | process | 2026-07-30 | Process | Drift was tracked only in dated audit narratives, so resolved findings were re-discoverable and "already fixed" was not a checkable claim — the root cause behind D3, D5, D6 and D9 | This file, enforced by `maanta-app/src/lib/__tests__/drift-register.test.ts` | eng |

---

## How to add a row

1. Take the next unused ID. Never reuse one.
2. State the gap as **claim vs reality**, not as a task. "X says A, code does B" ages
   correctly; "fix X" does not.
3. If you are opening and closing it in the same change, still add the row — the
   register is the record that it was ever wrong.
4. Cite evidence as a repo-root-relative path in backticks. The test resolves it.
5. Bump `Last updated` at the top. The test checks it is not older than the newest
   row.
