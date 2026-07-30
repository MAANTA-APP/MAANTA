# Skills: Design ↔ code sync pass — drift triage

Date: 2026-07-29 · Session mode: **Builder** · Branch: `claude/maanta-role-hardening-62ut64`

Current-state parity pass between the audited design truth and shipped code.
This file is the durable record of the triage: what was synced, what was
deliberately left alone, and why.

## Source-of-truth note (read this first)

The brief named **`Maanta Current Reality.dc.html`** as the entry-point
artifact. **That file is not in this repo, Notion, or Drive** — it was not
reachable from this session. The triage below was therefore driven by:

1. the drift list enumerated in the session brief (treated as the audit's own
   summary output),
2. the checked-in current-reality mirrors —
   `docs/notion-refresh/what-is-real-vs-staged-vs-planned.md`,
   `docs/notion-refresh/product-flows.md`,
3. repo/runtime behaviour verified directly (migrations, routes, guards).

Where the artifact would have been decisive and the mirrors were silent, the
item is classified **needs decision**, not guessed at. If the artifact is
checked in later, re-run this triage against it.

## Triage

| # | Drift item | Classification | Action | Status |
|---|---|---|---|---|
| 1 | "Deals Near Me" label vs shipped All Active Deals | **Copy mismatch** | Rail renamed to "All active deals" — **superseded by founder decision D-01 (2026-07-29): the section is Deals Near Me.** See `docs/skills/feed-deals-near-me-2026-07-29.md`. | ↩ reverted by decision |
| 2 | See-all screens with no route | **Partly stale + IA gap** | Routes existed (`/search?type=flash|boosted`); the filter sheet had no **Boosted** option, so the arriving state was unrepresentable and Apply silently changed it. Option added. | ✅ synced |
| 3 | Archive repost/delete absent | **Stale — code ahead of prototype** | Both shipped (`/api/deals/repost`, `DELETE /api/archive/[id]`, `archived-actions.tsx`). Real gap found instead: the buttons rendered for staff the API 403s. Now gated on `can_deals`. | ✅ synced (item itself was stale) |
| 4 | Elite 2-deal limit unenforced | **Stale at DB, real in UI** | `enforce_deal_limit` has always enforced 1/2 in Postgres. The UI never surfaced it: a merchant completed the whole wizard and uploaded a cover before meeting a raw trigger message. Limit now surfaced up front + product copy on the 409. | ✅ synced |
| 5 | Staff-permission granularity | **Mostly closed last pass** | Remaining hole was the archived-deals actions (see #3). | ✅ synced |
| 6 | M-Pesa-primary ideal vs Stripe Phase 1 reality | **Code was ahead of reality (wrongly)** | Top-up led with "M-Pesa number → Send STK push" even with no IntaSend credentials, guaranteeing a 502. Card (Stripe) is now the primary action wherever M-Pesa isn't provisioned; the route fails closed with an honest 503. | ✅ synced |
| 7 | Six flows missing prototype paths | **Design/prototype-side** | No code change is implied — these are clickable-prototype gaps, not shipped-behaviour gaps. | ⏸ deferred (design task) |
| 8 | §1–7 primitives predate the frozen brief | **Historical / provenance** | Provenance labelling on design artifacts. Re-authoring shipped primitives against a pre-freeze section would risk regressing the frozen rules for no user-visible gain. | ⏸ deferred (design task) |

## Detail on what changed

### 1. Feed rail: "Deals near me" → "All active deals" — SUPERSEDED

> **This rename was reversed.** Founder decision D-01 (2026-07-29) named the third
> section **Deals Near Me** and made it proximity-led. The reasoning below was
> right that the query was not distance-*filtered*; the decision was to make the
> rail genuinely proximity-led rather than to rename it away. Kept for provenance.

The rail is fed by `getLiveDeals().nearMe`, which is the **standard** deal
bucket for the selected node ordered by verified-redemption count, then by the
shopper's chosen sort. It is not distance-filtered, and merchant `lat`/`lng` is
optional — so the old title promised proximity the query never delivered.
Per-card distance (shown when merchant GPS exists) is the honest proximity
signal and is unchanged.

### 2. Boosted see-all

`/search` has always queried `type=boosted` (`.eq("boost_active", true)`), and
the feed's "Neighbourhood favourites → See all" links there. The 8n filter
sheet offered only All / Standard / Flash, so the state was invisible and
pressing Apply moved the shopper to a different filter. Added the fourth option.

### 3–5. Deal limit + permission alignment

`src/lib/deal-limits.ts` is a new pure module mirroring `enforce_deal_limit`
exactly, including the subtle part: it counts **every `is_active` deal**, not
the expiry-filtered "live" list the deals page renders. An expired-but-active
deal still occupies a slot in Postgres, so counting the shorter list would have
invited a publish the DB then rejects. `dealLimitReachedMessage()` is shared by
the up-front block and the API's 409, so one rule has one sentence.

### 6. Payment rail

`isMpesaTopupConfigured()` reads the real `INTASEND_API_KEY`/`INTASEND_SECRET`
env — it is a capability check, **not** a feature flag, and cannot be flipped to
fake a rail that has no credentials. Behaviour where IntaSend **is** configured
is byte-identical to before.

## Deliberately NOT implemented

| Item | Category | Why | Unblocks when |
|---|---|---|---|
| Six missing prototype paths | Design-ahead / prototype-only | Clickable-prototype coverage; no shipped-behaviour gap to close in code. | A design session closes the prototype gap. |
| §1–7 primitives vs frozen brief | Historical only | Provenance labelling. Rebuilding shipped primitives against pre-freeze sections risks regressing frozen money/colour rules for no user gain. | An explicit re-freeze decision. |
| Live M-Pesa STK top-up | Blocked by backend/runtime | IntaSend credentials are not granted. The code path exists and stays dormant; implementing it as live would be the exact failure the brief forbids. | IntaSend credentials issued. |
| Proximity-ranked "near me" rail | Needs PM/founder decision | Real distance ranking needs shopper geolocation consent + merchant GPS coverage (`lat`/`lng` is nullable and sparsely populated). Relabelled rather than half-built. | A decision on shopper geolocation + a GPS backfill. |
| Self-serve Elite subscription purchase | Design-ahead | Elite is activated by the MAANTA team; `/merchant/plan/upgrade` routes to support by design. | A payment rail for subscriptions. |
| Deal-limit E2E coverage | Blocked by data environment | Asserting the at-limit block needs a seeded merchant pinned at its limit; that state is mutated by any other deal test on the shared E2E backend. Covered by unit tests instead. | A per-run seeded/reset E2E merchant. |

## Tests added

- `src/lib/__tests__/deal-limits.test.ts` (9) — the plan-limit rule including
  the `>=` boundary, the over-limit case, and that raw trigger text never
  reaches a merchant.
- `src/app/api/topup/__tests__/route.test.ts` (3) — unconfigured M-Pesa returns
  503 and never calls IntaSend; `can_topup` is still checked first; the
  configured path is unchanged.
- `src/lib/__tests__/intasend-guard.test.ts` (+3) — `isMpesaTopupConfigured()`
  needs both keys.

Suite: 336 passing across 49 files. `lint`, `typecheck` and `build` green.

## Still out of sync after this pass

- ~~The `.dc.html` current-reality artifact is not checked into the repo, so
  there is no in-repo diffable design truth.~~ **Closed 2026-07-29** by the
  follow-up pass: `maanta-app/design/current-reality/` is now the canonical
  home (`frames.json`, CI-checked), with `docs/design-truth-protocol.md` and
  `docs/skills/design-sync-checklist.md`. The original `.dc.html` remains
  unavailable, so that folder is an honestly-labelled reconstruction awaiting
  source import — see its README.
- `docs/skills/claude-design-system.md` and `frozen-ui-overall-handoff.md` list
  the old rail name; both updated here, but they remain hand-maintained mirrors
  of Notion and can drift again.
- The four "deferred" rows above are unchanged by design.
