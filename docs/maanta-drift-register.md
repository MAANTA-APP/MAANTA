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

It started earning that before it was even merged. The first draft carried a row
saying `MAANTA_DEMO_MODE` was unverified; while the register sat on a branch, that
verification landed on `main` and turned up three further gaps in the process
(**D17**–**D20**). Rebasing forced the row to be re-checked against reality rather
than shipped as written — which is the entire mechanism, applied to itself.

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
| D2 | closed | product-decision | 2026-07-30 | Trials / money | Frozen launch offer is capped at the first 100 BBS Mall merchants; nothing enforced the cap or the node scope | Enforced by `maanta-app/supabase/migrations/20260730130000_enforce_elite_trial_first_100_cap.sql` + `maanta-app/supabase/tests/elite_trial_cap_test.sql`. **Live on production 2026-07-30**: `elite_trial_cap_status()` returns cap 100, granted 0, remaining 100 — the full offer is unspent, so no backfill surprise | founder |
| D3 | closed | doc-stale | 2026-07-30 | Feed ordering | Notion "Frozen Scope and Rules" claimed the feed structure was "enforced in code", citing a test file that never covered it | Notion bullet corrected with a dated sub-note; now cites `maanta-app/src/lib/__tests__/locked-feed-order.test.ts` | founder |
| D4 | closed | code-outlier | 2026-07-30 | Pricing copy | `/pricing` promised "first month of Elite free" — no cap, no node scope, no fee caveat — against a frozen offer that has all three | `maanta-app/src/app/(public)/pricing/page.tsx`, guarded by `maanta-app/src/lib/__tests__/pricing-copy.test.ts` | founder |
| D5 | closed | mirror-stale | 2026-07-30 | Trials | A code comment called the 14-vs-30-day trial conflict "an open spec/DB conflict" after the 2026-07-29 audit had already resolved it to 30 days. First recorded re-discovery | Corrected in `maanta-app/src/app/api/admin/merchants/[id]/approve/route.ts`. no guard: a test cannot assert that prose is not misleading; the 30-day value itself is covered by `maanta-app/supabase/tests/elite_trial_cap_test.sql` | eng |
| D6 | closed | mirror-stale | 2026-07-30 | Trials | The launch offer was a frozen rule in Notion and appeared nowhere in the repo mirror, though another decisions-log entry referenced it in passing | `docs/maanta-decisions-log.md` | eng |
| D7 | closed | code-outlier | 2026-07-30 | Pricing copy | "Free" rendered as Standard's headline price, while a Standard merchant pays the success fee on every verified redemption | Copy fixed on both public pages and guarded by the bare-"Free" check in `maanta-app/src/lib/__tests__/pricing-copy.test.ts` | founder |
| D8 | closed | code-outlier | 2026-07-30 | Pricing | The frozen success fee existed as four independent `30` literals across public pages, page metadata and a fallback | Single-sourced as `SUCCESS_FEE_KES` in `maanta-app/src/lib/pricing.ts`; uniqueness asserted by `maanta-app/src/lib/__tests__/pricing-copy.test.ts` | eng |
| D9 | closed | db-metadata | 2026-07-30 | Pricing | Live `app_config.success_fee_kes` notes gave the Elite price review as "Oct 2026" (superseded by the 2026-07-20 ruling) and cited two files that do not exist in this repo | `maanta-app/supabase/migrations/20260730120000_correct_success_fee_config_notes.sql` + `maanta-app/supabase/tests/frozen_commercial_config_test.sql`. **Live on production 2026-07-30**, read back from `app_config`: notes now cite `CLAUDE.md` and `docs/maanta-decisions-log.md` and give the Feb 2027 review. Applied under a different version number than the file carries — see D24 | eng |
| D10 | closed | process | 2026-07-30 | Ops | Two merged migrations were not applied to production, so D2 and D9 were merged-but-not-true | Pushed by a human operator per `docs/ops/supabase-migrations.md` and verified read-only on 2026-07-30: cap live at `cap 100, granted 0, remaining 100` (recorded against D2), corrected notes live in `app_config` (D9). no guard: whether a migration has been applied is a property of the live database, not of this repo — the check is the read-back, which is why the numbers are recorded here rather than asserted in a test | founder |
| D11 | closed | code-outlier | 2026-07-30 | Feed ordering | An unrecognised `?sort=` reached the distance branch, undoing the D1 locked order from a URL; an unrecognised `?filter=` emptied every rail and claimed the mall had no deals | `parseDealListSort` / `parseDealListFilter` in `maanta-app/src/lib/deal-list-controls.ts`, covered by `maanta-app/src/lib/__tests__/locked-feed-order.test.ts` | eng |
| D12 | closed | code-outlier | 2026-07-30 | Trials / money | The D2 cap was gated on UPDATE only, so an INSERT carrying a trial bypassed it unstamped — which `node0_rehearsal_seed.sql` actually does — making the slot count under-report permanently | Trigger widened to `BEFORE INSERT OR UPDATE`; Scenario H in `maanta-app/supabase/tests/elite_trial_cap_test.sql` | eng |
| D13 | closed | code-outlier | 2026-07-30 | Audit trail | The approve route logged the trial *request* as the outcome, so a refused or unverifiable grant was recorded as granted | Three explicit outcomes in `maanta-app/src/app/api/admin/merchants/[id]/approve/route.ts`. no guard: asserting the logged outcome needs a route-level integration test against a live Supabase, which this repo does not have yet — same blocker as the browser golden-path item in the decisions log | eng |
| D14 | open | process | 2026-07-30 | Demo mode | `app_config.demo_mode_enabled` is `true` on production. Correct for rehearsal, and its own notes say it must be `false` at launch — so today the live product shows synthetic shops and deals to anyone who visits | Flip to `false` as part of the launch checklist and close this row with the timestamp. Runbook: `docs/ops/demo-mode-runbook.md` | founder |
| D17 | closed | process | 2026-07-30 | Demo mode | The `MAANTA_DEMO_MODE` Vercel var could not be read from a Claude session, so it was assumed rather than known — and the property schema was not evidence, since the only prior server events predated the tagging entirely | Proved from the event stream on 2026-07-30 01:19Z, recorded in `docs/ops/optruth-demo-release-2026-07-29.md`. no guard: a deployed env var cannot be asserted from the repo; the proof is an observed event, so re-verify after any change to it | founder |
| D18 | open | process | 2026-07-30 | Demo mode | The two demo switches can be flipped independently, and `make demo-off` touches only `app_config`. Turning demo mode off while `MAANTA_DEMO_MODE` stays `true` tags **real** events as demo — the precise inversion of what the tagging exists to do | Flip both together at launch, or make the ops target set both. Trap documented in `docs/ops/optruth-demo-release-2026-07-29.md` | founder |
| D19 | open | process | 2026-07-30 | Demo mode | `MAANTA_DEMO_MODE` is unset on the Preview environment, so synthetic preview traffic reaches PostHog indistinguishable from production activity. It already cost one untagged event during the D17 verification | Harmless while previews are one-off checks. Set it on Preview before previews are ever used to demo to anyone. See `docs/ops/optruth-demo-release-2026-07-29.md` | founder |
| D20 | closed | code-outlier | 2026-07-30 | Analytics | Every server-side capture — `deal_viewed`, `deal_claimed`, `guardian_outcome`, both top-up events — dropped an unknown share of events: the in-flight fetch died when the Vercel instance froze after the response. Found while verifying D17; predates demo mode | Fixed with `waitUntil` in `captureServerEvent` — `maanta-app/src/lib/analytics.ts`, covered by `maanta-app/src/lib/__tests__/analytics.test.ts`. **Data caveat stays true forever**: any server-side funnel computed over events from before that deploy is a floor, not a measurement | eng |
| D21 | closed | code-outlier | 2026-07-30 | Analytics | `captureDealViewed` sent `clerkUserId ?? "anonymous"`, and browsing needs no account — so most of the top of the funnel collapsed onto one PostHog person. `uniq(person_id)` on `deal_viewed` returned 1 for all signed-out traffic however many people it was, and a view→claim funnel could not join for signed-out users. Stayed hidden because D20 meant the events were not arriving at all | Fixed by reusing the browser's own id — `maanta-app/src/lib/analytics-identity.ts`, covered by `maanta-app/src/lib/__tests__/analytics-identity.test.ts`. **Data caveat stays true forever**, like D20: signed-out unique-viewer counts and view→claim funnels over events from before this deploy are not measurements | eng |
| D22 | open | code-outlier | 2026-07-30 | Analytics | The D21 fix reads `distinct_id` from the posthog-js cookie, which is correct only for the current config: default persistence, no `persistence_name` override, and `defaults` below the 2026-05-30 cutoff where `split_storage` moves the id out of that cookie. If any of those changes the read silently returns nothing and the server falls back — **indistinguishable from a genuine first-ever view, so no runtime warning is possible** | Re-verify signed-out attribution after any posthog-js upgrade or config change; `distinct_id_source` (`clerk` / `posthog_cookie` / `none`) is the property to watch — a sudden shift toward `none` is the symptom. no guard: the failure is silent by construction, so a test in this repo cannot detect it; it needs an occasional look at the live property distribution | eng |
| D15 | deferred | doc-stale | 2026-07-30 | Pricing | `/pricing` hardcodes KES 3,500 with no `app_config` key behind it, unlike the success fee and boost fee, so the UI is the only place a price change lands | Add `elite_subscription_kes` when subscription billing is wired to a processor. Revisit at the Feb 2027 Elite price review | eng |
| D16 | closed | process | 2026-07-30 | Process | Drift was tracked only in dated audit narratives, so resolved findings were re-discoverable and "already fixed" was not a checkable claim — the root cause behind D3, D5, D6 and D9 | This file, enforced by `maanta-app/src/lib/__tests__/drift-register.test.ts` | eng |
| D23 | closed | mirror-stale | 2026-07-30 | Trials / money | The D2 cap migration told the reader "The admin UI reads elite_trial_cap_status() to know this will happen before ticking the box" — written as fact when no UI read the RPC at all, so an admin could exhaust the offer with no warning. Fifth recorded case in this audit of a comment outrunning the code it describes | Made true on `main` by #144: three call sites now read the RPC (`maanta-app/src/app/admin/billing/page.tsx`, `maanta-app/src/app/admin/merchants/[id]/page.tsx`, `maanta-app/src/lib/elite-trial.ts`), written up in `docs/skills/e2e-readiness-2026-07-30.md`. no guard: the drift was a false sentence in a migration comment, and no test can assert that prose matches behaviour — the callers are the reality, and they are now what the comment claims | eng |
| D24 | open | process | 2026-07-30 | Ops | Production's migration ledger and this repo disagree about which migration each version number *is*. Prod records `20260730120000` as `node_scoped_opening_credit_cap` — a migration with **no file anywhere in this repo** — while the repo's `20260730120000` is the success-fee notes fix, which prod recorded at `20260730160000` instead. This contradicts CLAUDE.md's claim that the migration history is "the authoritative record of DB behavior" | Reconcile the ledger with a human operator: export `node_scoped_opening_credit_cap` from prod into a repo file so the applied change is in version control, then repair the version numbering so filenames and ledger agree. Claude Code must not run migrations — see `docs/ops/supabase-migrations.md`. Verified read-only against `supabase_migrations.schema_migrations` on 2026-07-30 | founder |
| D25 | pending-deploy | code-outlier | 2026-07-30 | Core loop | The D24 numbering collision cost a fix: the paused-deal gate was merged on `main` as version `20260730160000`, which prod's ledger already held, so `supabase db push` treated it as applied and skipped it silently. Confirmed live on 2026-07-30: `claim_deal` on production contains no `deal_paused` branch, so a paused deal still accepts new claims while the merchant UI says "No new claims while paused" | Renumbered past the ledger to `maanta-app/supabase/migrations/20260730170000_restore_claim_deal_pause_gate.sql`, so `db push` will now apply it; covered by `maanta-app/supabase/tests/claim_deal_pause_gate_test.sql`. **Not live until a human runs `supabase db push`** — the renumbering only makes it applicable, it does not apply it. Close only on the read-back: `pg_get_functiondef` for `claim_deal` must contain `deal_paused`. Until then the pause control is still cosmetic on production | founder |

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
