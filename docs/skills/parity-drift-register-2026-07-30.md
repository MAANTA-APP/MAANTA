# Parity drift register — 2026-07-30

Buckets required by the parity audit brief. Each item: evidence → consequence → action.

---

## Must sync now

### M1 — Paused deals advertised while claim rejected *(fixed)*

- **Evidence:** `selectLiveDealBucket` filtered `is_active` + `expires_at` only; merchant UI promised “hidden from the feed”; `claim_deal` raises `deal_paused` (`20260730160000`).
- **Consequence:** Shoppers saw Claim → 409; feed lied relative to till pause.
- **Action (done):** `.eq("is_paused", false)` in live selects; detail “Deal paused”; `is_paused` on `DealRow`; test in `get-live-deals.test.ts`.

### M2 — New-claim CTA during grace *(fixed)*

- **Evidence:** `isDealClaimable` returned true for `in_grace`; SQL requires `expires_at > NOW()` for new claims; grace is for claimed tickets.
- **Consequence:** Detail showed Claim after deal end → `deal_expired`.
- **Action (done):** Claimable = live only; `isDealInRedemptionWindow` for merchant list; lifecycle count matches shopper visibility.

### M3 — Alerts contradicted verify-anyway *(fixed)*

- **Evidence:** `alerts/page.tsx` said “Top up to verify” / “N can be verified”; wallet + redeem correctly allow verify with arrears.
- **Consequence:** Merchants trained to believe till is blocked by balance.
- **Action (done):** Copy discloses arrears path + new-deal zero-balance gate only.

### M4 — Admin reason filters were cosmetic *(fixed)*

- **Evidence:** `/admin/deals` reason pills did not change the query.
- **Consequence:** UI implied report taxonomy that does not exist.
- **Action (done):** Removed pills; documented design-ahead in page + frames.json.

### M5 — Route inventory aliases *(fixed)*

- **Evidence:** `/otp`, `/founder/reports` named in inventories but missing.
- **Consequence:** Walkthroughs 404 / confuse operators.
- **Action (done):** Redirect aliases to `/verify-phone` and `/admin/reports`.

---

## Okay after pilot

### O1 — My-deals list countdown may show deal end vs code+grace

- **Evidence:** List row can use `deals.expires_at`; detail uses redemption `expires_at` (deal+15m).
- **Consequence:** Minor timer mismatch on list only.
- **Action:** Prefer snapshotted redemption expiry on list when present; not launch-blocking.

### O2 — Publish button still clickable at zero balance

- **Evidence:** Wizard shows top-up CTA; API returns 402; button not disabled.
- **Consequence:** Extra round-trip error vs proactive disable.
- **Action:** Optional UX tighten; backend already honest.

### O3 — Feed marketing titles vs locked Notion names

- **Evidence:** UI “Top picks / Neighbourhood favourites / Deals near me”; Notion Flash / Priority Placements / All Active Deals; order enforced.
- **Consequence:** Docs/ops ambiguity; shopper UX intentional per frozen-UI handoff.
- **Action:** Product call — keep marketing (document) or rename. Behavior already synced.

### O4 — Reject network errors swallowed on redeem keypad

- **Evidence:** `.catch(() => null)` on reject path.
- **Consequence:** Silent fail on network blip.
- **Action:** Surface InlineAlert after pilot polish.

---

## Design ahead

### D1 — `/contact` send message

- **Evidence:** Client-only; no API.
- **Consequence:** Fake success.
- **Action:** Label or wire backend later; do not claim as support channel.

### D2 — Admin deal report reasons (misleading / prohibited)

- **Evidence:** No shopper report source; fraud_events only.
- **Action:** Keep thin fraud-signal queue until report taxonomy ships.

### D3 — Richer wireframe-only states outside claim-and-till

- **Evidence:** PDF / external `.dc.html` may show archive/repost rails and screens beyond code.
- **Action:** Classify against `frames.json` before implementing; do not assume backend gap.

### D4 — External Claude Design canvas not vendored

- **Evidence:** claim-and-till README points at `.dc.html` on Claude Design; not in repo.
- **Action:** Current-reality inventory is `frames.json` + claim-and-till HTML.

---

## Needs product decision

### P1 — Standalone `/map` vs Notion “no map in customer feed”

- **Evidence:** Notion do-not-build: “Map view in the customer feed.” Code ships `/map` as nav peer; browse lat/lng → map; **does not** redirect map→browse.
- **Consequence:** False claim in some readiness docs that map redirects to browse.
- **Action:** Confirm whether standalone map stays in MVP nav. Until then: document as live separate surface.

### P2 — Agent attribution window beyond 48h lead lock

- **Evidence:** `locked_until` default 48h; attribution is label-only (`agent-attribution.md`); no commission clock.
- **Action:** Decide if “attribution window” is a product term or just lead lock language.

### P3 — Feed section naming (see O3)

- Same decision as O3; elevated if founders want Notion-literal labels in UI.

---

## Blocked by env/ops

### E1 — Interactive browser / Playwright E2E

- **Evidence:** Clerk FAPI needs real publishable+secret; Playwright suite self-skips without `E2E_*`.
- **Action:** Provision non-prod Clerk + secrets; keep SQL golden path as CI money-path proof.

### E2 — Hosted migration apply for 07-30 cap / pause / fee notes

- **Evidence:** Migrations in repo; prod apply is human-owned (truth-audit FU-2).
- **Action:** Apply + verify `elite_trial_cap_status()` and pause gate on hosted DB.

### E3 — IntaSend STK

- **Evidence:** Secondary CTA only when configured; Stripe is primary.
- **Action:** Do not demo STK as live without keys.

### E4 — Local `service_role` GRANT

- **Evidence:** AGENTS.md — local stack lacks hosted defaults; empty feed without GRANT.
- **Action:** One-shot GRANT after `supabase start`.
