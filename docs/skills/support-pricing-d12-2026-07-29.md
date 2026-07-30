# Skills: admin support + public pricing — drift D-12

Date: 2026-07-29 · Session mode: **Builder** · Branch: `claude/maanta-role-hardening-62ut64`

## D-12 is narrowed, not closed

The row bundled **two surfaces with two different blockers**, and only one was
settleable from the repo.

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

## Verification

`npm run lint` · `npm run typecheck` · `npm test` (**506 passing**) ·
`npm run build` — all green. Contract smoke coverage is now **17 frames** (11e
and 12e added).
