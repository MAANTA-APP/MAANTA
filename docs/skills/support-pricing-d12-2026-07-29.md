# Skills: admin support + public pricing — drift D-12

Date: 2026-07-29 · Session mode: **Builder** · Branch: `claude/maanta-role-hardening-62ut64`
Updated: 2026-07-30 — clarify governed first-100 Elite trial vs withdrawn free-month copy.

## Current commercial rule (read this first)

| Copy | Status |
|---|---|
| “First 100 BBS Mall merchants get a **30-day Elite trial** (KES 30 still applies)” | **Governed and allowed** — DB-backed via `elite_trial_cap_status()`; on `/pricing` |
| “Launch offer: first month of Elite **free**” | **Withdrawn (D-12)** — no cap, no node, implied fee waiver |

See `docs/ops/founder-parity-handoff-2026-07-30.md`. Cash-only CI blocks only the
ungoverned free-month phrasing.

## D-12 is CLOSED (founder ruling, same day)

This doc records two passes. The first narrowed the row to one commercial
question; the founder answered it the same day and the row is now closed. Read
[the ruling](#the-ruling--offer-withdrawn-row-closed) at the end for the
settled state; the sections before it are the reasoning that produced it.

The row originally bundled **two surfaces with two different blockers**, and only
one was settleable from the repo.

> "Admin support (11e) and public pricing (12e) are current but intentionally not
> clickable: 11e is a desktop ops surface outside the phone prototype, 12e is
> blocked on unresolved launch-offer copy." — `blockedOn: prototype`

The prototype itself lives in the Claude Design project, which this session
cannot reach — so **no prototype coverage could be added here regardless.** What
*was* checkable is whether the two shipped screens match what the mirror claims.
They did not.

## 11e Admin support — settled, and never really drift

`stateCoverage` claimed **zero** of two states covered. Both ship:

| Evidence | Line |
|---|---|
| `view` switches on `?view=resolved` | `admin/support/page.tsx:17` |
| Per-state heading (`Open issues (N)` / `Resolved issues`) | `:28-29` |
| Per-state empty state (`No open issues` / `Nothing resolved yet`) | `:50` |
| Override action renders on **open** only | `:71` |

Corrected to `missing: []`, and the frame is now **smoke-eligible** on the
default `Open issues` heading (substring match — the heading carries a live
count).

`prototypeStatus` stays `current-not-clickable`. That is a **deliberate scope
decision** — a desktop ops surface outside the phone prototype — not a gap to
close. It should probably never have been filed as drift.

## 12e Pricing — a real, opposite-signed finding

`stateCoverage` also claimed zero of three states. All three ship: Standard and
Elite cards side by side *are* the comparison. Corrected, and smoke-eligible on
`Simple pricing`.

### R-PLAN-NAMES was being violated in production

Frozen rule: *plans are **Standard** and **Elite**, never "Free".*

Both public plan cards rendered the Standard plan's **price** as **"Free"**:

- `src/app/(public)/pricing/page.tsx:12`
- `src/app/(public)/for-merchants/page.tsx:203`

Beyond the frozen-copy breach this **misstates the business model**: Standard
carries the KES 30 success fee. Calling it "Free" on the pricing page is the one
place that claim does real damage.

Both now read **"No monthly fee"** — accurate, and already the phrasing the
for-merchants bullet list used ("No monthly fee, ever"). Locked by
`src/__tests__/cash-only-and-copy.test.ts`, which asserts neither page prices a
plan as `Free`, both name Standard and Elite, and the success fee stays visible
beside the Standard card so "no monthly fee" can never read as "costs nothing".

`Free to list` on for-merchants was left alone — listing genuinely is free, and
it is not a plan name.

### The launch offer — needs a founder call, left in place

The mirror said the launch-offer copy was "unresolved, so building it would bake
in a number that may change". The opposite is true: `/pricing:24-26` **already
ships** the line to the public —

> Launch offer: first month of Elite free

Whether MAANTA makes that offer is a **commercial decision**, so I did not touch
it. Deleting a live public offer is as consequential as keeping it, and it is not
mine to make.

So D-12 is **reclassified `current-mismatch` / `blockedOn: product-decision`**
and narrowed to this one question. `blockedOn: prototype` was wrong — the
prototype gap for 11e is intentional, and 12e's blocker is commercial.

**What I need:** confirm the offer, change it, or remove it. Note it is also
untracked anywhere else — no decisions-log entry, no `app_config` key — so
nothing currently reconciles it against what Elite trials actually grant.

## The ruling — offer withdrawn, row closed

Founder decision, 2026-07-29:

> Treat the "Launch offer: first month of Elite free" line as **withdrawn** until
> a governed launch offer exists.

So the line is gone from `/pricing`, and there was no duplicate to remove
elsewhere — the grep across `/pricing`, `/for-merchants` and the landing page
found the one instance. Everything else in the pricing copy is untouched.

Two things were deliberate at the removal site:

1. **An explanatory comment replaces the line** (`pricing/page.tsx:24-29`). A
   blank space invites the next person to fill it; a comment saying *why* it is
   blank does not.
2. **A test makes re-adding one deliberate.**
   `cash-only-and-copy.test.ts` → *"carries no ungoverned launch-offer promise on
   any public page"* scans all three public pages for
   `/launch offer|first month[^.]{0,30}free|month of elite free|free month/i`.
   It **strips comments first**, so the explanatory comment neither satisfies the
   test nor trips it — the guard tracks what ships to a shopper, not what a
   developer reads.

### What "governed" has to mean before any future offer ships

The line's real defect was not the words, it was that nothing owned them. A
future Elite launch offer needs both halves before it is re-advertised:

- an **`app_config` key** — the same pattern as `node0_opening_credit_kes` and
  `guardian_thresholds`, so the offer has a live value and an end date the copy
  can be reconciled against and pulled from when the window closes; and
- a **decisions-log entry** stating what it grants and how it interacts with the
  30-day trial → 7-day grace → auto-downgrade ladder in `handle_trial_expiry`.

Recorded in `docs/maanta-decisions-log.md` (2026-07-29, D-12).

**A related weakness was flagged here and closed the next day.** `OPENING_CREDIT
= 300` was hardcoded in `for-merchants/page.tsx` even though the server reads it
from `app_config` — the same class of problem, public copy that no config can
pull. It differed from the withdrawn Elite offer in one respect that made it a
follow-up rather than part of this row: it *is* a governed promise, with an
`app_config` key and a decisions-log entry behind it. Only the copy was
ungoverned. Fixed 2026-07-30 — the page now reads the same four keys the SQL
grant reads and both promo blocks disappear when the gate stops granting. See
`docs/skills/launch-credit-config-driven-2026-07-30.md` and the 2026-07-30
decisions-log entry.

### Copy that was tightened on the way

Writing the "Standard is never described as free" guard immediately failed on
copy I had left alone, which is the guard working:

| Was | Now | Why |
|---|---|---|
| "…then stays **free on Standard** if you don't convert" | "…then moves to Standard with **no monthly fee** if you don't convert" | Standard carries the KES 30 fee; it is not free |
| "One standard deal **is free**." | "**Posting** a standard deal **costs nothing**." | The posting is free; the redemption is not |

`Free to list` (`for-merchants:75`) stayed — listing genuinely is free and it is
not a plan name.

### Closing conditions, each verified

| Condition | Evidence |
|---|---|
| R-PLAN-NAMES satisfied | Both plans named Standard/Elite on both pages — `it.each(PLAN_PAGES)("%s names both plans")` |
| Standard never labelled "Free" | Price renders "No monthly fee" — `pricing:12`, `for-merchants:203`; `>Free<` asserted absent |
| Success fee visible beside Standard | `pricing:10` — "1 standard deal · KES 30 success fee per verified redemption" |
| No ungoverned launch-offer promises | The comment-stripped scan above, across all three public pages |

Contract: frame `12e` → `captureReadiness: safe-now` (its
`captureReadinessReason` removed, `prototypeBlockedReason` rewritten); drift
`D-12` → `historical` / `blockedOn: none`, the four conditions recorded in its
`detail`, and added to `landedInRepo.closesDrift`. A D-12 block in
`design-truth.contract.test.ts` keeps the ruling from being quietly reopened —
the generic invariant means reopening the row while 12e claims `safe-now` fails
Layer 1.

**All 11 drift rows are now `blockedOn: none`.**

## Verification

First pass: `npm test` **506 passing**. After the ruling: `npm run lint` ·
`npm run typecheck` clean; `npm run test:design-truth` **130 assertions**;
`npm test` **509 passing**; `npm run build` green. Contract smoke coverage is
**17 frames** (11e and 12e added).
