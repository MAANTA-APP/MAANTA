# D88 — production verification checklist

**Status:** prepared 2026-08-10, **not yet run** · **Drift row:** **D88** (open,
pending deploy verification) · **Decision:**
`docs/ops/d88-analytics-attribution-decision.md`

## Why this exists

D88's implementation is complete in code and guarded by
`maanta-app/src/lib/__tests__/analytics-cookieless.test.ts`. **That is not
verification.** Every claim made so far rests on reading source — the
posthog-js storage module, the provider config, the tracker — and source
inspection cannot show what a browser actually writes to disk or what a live
analytics pipeline actually receives.

**Two behavioural outcomes must be evidenced before D88 closes:**

1. Under the shipped configuration, MAANTA persists **no** PostHog or browser
   analytics identifier to cookies, `localStorage`, `sessionStorage`, IndexedDB,
   or any other browser-persistent store.
2. A signed-out live `deal_viewed` followed by a normal claim flow records the
   expected identity/event linkage across the intended navigation cases.

Outcome 1 is the one with legal weight: `/cookies` tells the public that nothing
is stored on an anonymous device, and that is the stated basis for shipping no
consent banner. Outcome 2 is the one with commercial weight: it is the funnel
the D14 launch needs.

**Nothing in this document changes configuration.** No Playwright, no tunnel, no
new SDK, no cookies, no consent UI, no deployment settings.

---

## Part A — Local browser validation

Run against the local production build (`npm run build && npm start` from
`maanta-app/`) if runtime configuration allows. A PostHog project token must be
present for posthog-js to initialise at all — without one it is a no-op and the
run proves nothing. **If no token is available locally, record that and rely on
Part B.**

### A1 · Baseline the storage before anything loads

Open a **fresh normal browser profile**, DevTools → Application:

- [ ] Cookies for the origin: recorded (expected: none, or only auth/session).
- [ ] `localStorage`: recorded.
- [ ] `sessionStorage`: recorded.
- [ ] IndexedDB databases: recorded.

Baseline first. "No PostHog key present" is only meaningful against a known
starting state.

### A2 · Load a signed-out deal-detail page

- [ ] Signed out confirmed (no session cookie, no account UI).
- [ ] `/deals/<id>` loads normally.

### A3 · Re-inspect storage — the load-bearing check

- [ ] **No cookie** whose name matches `ph_*_posthog` or contains `posthog`.
- [ ] **No `localStorage` key** matching `ph_*` / `posthog` / `__ph`.
- [ ] **No `sessionStorage` key** matching the same.
- [ ] **No IndexedDB database** created by the analytics client.
- [ ] Diff against the A1 baseline: **no new persistent analytics entry.**

> A failure here is not an analytics bug. It means `/cookies` is false as
> published — stop, do not continue, and escalate to founder and legal.

### A4 · Exactly one `deal_viewed` per view

DevTools → Network, filter `ingest` (events proxy through MAANTA's origin):

- [ ] Exactly **one** `deal_viewed` capture for one page view.
- [ ] Properties are only: `deal_id`, `merchant_id`, `deal_type`, `price_kes`,
      `node`, `capture_side: "client"` (plus posthog-js's own defaults).
- [ ] **No** shopper identifier, phone number, ticket id, redemption code,
      token, or merchant-private field.
- [ ] Note the `distinct_id` on the request.

### A5 · React double-invoke check

- [ ] Repeat A4 in a **production** build, not `npm run dev`. React StrictMode
      double-invokes effects in development, and the tracker's `useRef` guard is
      specifically there to stop that double-firing. Verify in production mode,
      then optionally in dev to confirm the guard holds there too.

### A6 · In-app navigation, then a claim

- [ ] From `/feed`, navigate to a deal via a normal in-app link (`next/link`),
      not by typing the URL.
- [ ] `deal_viewed` fires once for the new deal.
- [ ] `distinct_id` is **the same** as the one recorded in A4.
- [ ] Begin a claim flow (phone verification / sign-in as the product requires).
- [ ] Record whether the subsequent events retain the expected linkage to that
      view — including after `identify()` binds the session to a real user.

### A7 · Hard refresh — record the known limitation

- [ ] Hard-refresh the deal page.
- [ ] `distinct_id` **changes**. This is expected: memory persistence lasts the
      pageview, and the cross-pageview stitching was given up deliberately by
      the cookieless ruling of 2026-07-31.
- [ ] Record it as an observed limitation, not a defect.

### A8 · Re-check storage one last time

- [ ] After all navigation and the claim attempt, storage still shows **no**
      analytics identifier. Some libraries only persist on first *capture*
      rather than on init, which A3 alone would miss.

---

## Part B — Production validation after deployment

**A named human operator runs this.** Claude does not.

### B0 · Preconditions

- [ ] The commit carrying D88 is deployed to production and READY.
- [ ] Deployed commit SHA and Vercel deployment id recorded below.
- [ ] Clean browser profile or private window — **not** a profile that has
      visited MAANTA before, or the baseline is meaningless.

### B1 · Storage

- [ ] Repeat **A1 → A3** against `https://www.maanta.app`.
- [ ] Confirm the deployed client is configured memory-only: no PostHog
      identifier in any browser-persistent store after a real page load.

### B2 · Event arrival

- [ ] `deal_viewed` appears in PostHog for the live view.
- [ ] It carries `capture_side: "client"`.
- [ ] It carries no shopper-identifying or redemption-sensitive property.

### B3 · Linkage

- [ ] Where a **safe test account or permitted process** exists, confirm a
      subsequent `deal_claimed` has the expected relationship to the view event.
- [ ] If no safe path exists, **record that and close on B1/B2 alone**, stating
      the linkage as verified locally only. Do not run test claims against real
      merchant inventory — that consumes real deals and writes real fee rows.

### B4 · Recording

Record in the D88 row: timestamp (UTC), deployed commit SHA, deployment id,
operator name, environment, result per check, and any limitation.

> **Do not paste credentials, session cookies, tokens, real shopper phone
> numbers, or full request headers into this document or the register.** Record
> that a check passed and what was observed, not the raw material.

---

## Evidence template

```md
**D88 verification — <YYYY-MM-DD HH:MM UTC>**

Deployed commit: <sha> · Deployment: <dpl_...> · Operator: <name>
Environment: production (https://www.maanta.app) · Profile: clean/private

Part A (local, <date>): A1 ✅ · A2 ✅ · A3 ✅ no analytics identifier persisted ·
A4 ✅ one deal_viewed, properties as expected · A5 ✅ single fire in prod build ·
A6 ✅ distinct_id retained across next/link nav; claim linkage <result> ·
A7 ✅ distinct_id changes on hard refresh (expected limitation) · A8 ✅

Part B (production): B1 ✅ no PostHog identifier in cookies / localStorage /
sessionStorage / IndexedDB · B2 ✅ deal_viewed present with capture_side="client" ·
B3 <result, or "no safe test path — closed on B1/B2, linkage verified locally only">

Limitations observed: <hard-refresh stitching; any other>
```

## What would reopen this

- Any analytics identifier found in browser-persistent storage → **outcome 1
  fails**, `/cookies` is false as published, escalate immediately.
- More than one `deal_viewed` per view in a production build → the `useRef`
  guard is not holding and the top of the funnel is inflated.
- `deal_viewed` missing from PostHog entirely → client capture is being blocked
  or the proxy path is broken; the metric is worse off than before the change.
