# D88 — Signed-out analytics attribution: decision brief

**Date:** 2026-08-10 · **Mode:** Planner · **Status:** ✅ decided (option C), implemented and guarded 2026-08-10 — **D88 closed**
· **Drift row:** **D88** (closed) · **Related:** **D22**, **O6**, **D14**

## The question

`maanta-app/src/lib/analytics-identity.ts` exists to give a signed-out
server-side event the same PostHog person the browser is using. It cannot do
that under the shipped client config. **Decide what replaces it.**

## What is actually true

Verified from source this session, not from the register.

### The contradiction is real, and it is one line

`analytics-identity.ts` states three preconditions in its docblock. Two hold;
the load-bearing one does not.

| # | Precondition | Shipped | Holds? |
|---|---|---|---|
| 1 | `persistence` left at default (`localStorage+cookie`) — "set it to `localStorage` or `memory` and there is no cookie to read" | `persistence: "memory"` (`posthog-provider.tsx:38`) | ❌ |
| 2 | `persistence_name` not set, so the cookie is `ph_<token>_posthog` | not set | ✅ |
| 3 | `defaults` stays below `"2026-05-30"` | `"2026-01-30"` | ✅ |

The module documents its own failure condition and then ships inside it. The
founder ruling that set `memory` was **2026-07-31**, one day after **D22** was
opened warning about exactly this.

### Consequence

`serverPosthogDistinctId()` returns `null` on **every** request in production —
posthog-js never writes the cookie it reads. So every signed-out server event
falls to `distinct_id_source: 'none'`, which `analytics.ts:311` already warns
must be excluded from any per-user metric.

### Blast radius: one caller

```
src/app/(shopper)/deals/[id]/page.tsx:58 → captureDealViewed({ posthogDistinctId: … })
```

That is the **only** consumer. The affected metric is `deal_viewed` for
signed-out shoppers, and specifically the **`deal_viewed` → `deal_claimed`
funnel**, which cannot join when the view has no person and the claim has a real
user id. The call site's own comment states the stakes: "without the browser's
own distinct id the whole top of the funnel collapses onto one person."

### Why CI never caught it

`analytics-identity.test.ts` mocks `cookies()` and injects a posthog cookie, so
it tests a world production never produces. The parser tests are sound; the
integration premise is not. **Nothing in CI observes the shipped `persistence`
value.**

### The constraint the register understated

`src/content/legal/cookie-notice.md` is a **live public route** (`/cookies`) and
commits in writing:

> "We do not ask for consent to a cookie banner for this, because we do not
> store analytics identifiers on your device before you sign in. Analytics for
> anonymous visitors runs in memory only and is discarded when you close the
> tab."

and, in the retention table:

> "Analytics identifiers — **None for anonymous visitors** — nothing is stored
> on your device."

This is not a preference. It is a published statement that is the stated basis
for shipping no consent banner. **Any option that writes an identifier to an
anonymous device requires editing a published legal document** — while `O5`
(counsel review) is a blocked launch gate.

## Options

### A — Retire the cookie-reading path

Delete `analytics-identity.ts` and its test, drop the `posthogDistinctId`
argument, and record signed-out `deal_viewed` as explicitly unattributed. Update
the D22/D88 rows and the module's claim.

- ✅ Honest, small, and matches shipped behaviour exactly.
- ✅ No legal change, no banner.
- ❌ **Permanently gives up the signed-out view→claim funnel.** Accepting this
  one week after ruling (D14) that real organic traffic should be sent into the
  loop to produce evidence is a real cost, not a formality.

### B — Restore cookie persistence behind consent

Set `persistence` back to the default and build a consent mechanism.

- ✅ Restores full cross-session attribution.
- ❌ Contradicts the published Cookie Notice; requires rewriting it under a
  **blocked** legal gate (`O5`), and `O6` (Kenya DPA cross-border basis) is not
  started.
- ❌ Reverses the 2026-07-31 ruling on reasoning that still holds — the provider
  docblock argues a banner "costs most of the anonymous analytics anyway and
  adds friction to the one journey that has to feel frictionless."
- ❌ Largest diff, on the surface with the least room for error.

### C — Move `deal_viewed` to client-side capture ⭐ recommended

Capture `deal_viewed` in the client rather than the server. Under `memory`
persistence posthog-js still mints a `distinct_id` for the tab and attaches it
to every event it sends — so the view and a later `deal_claimed` in the same
session land on **one person**, with nothing written to the device.

- ✅ **Recovers the funnel D14 needs**, within a session.
- ✅ Cookie Notice unchanged, no banner, no legal gate, no reversal of the
  2026-07-31 ruling. Nothing is stored on an anonymous device.
- ✅ Retires the contradiction: `analytics-identity.ts` goes away because it is
  no longer needed, not because the metric was abandoned.
- ⚠️ Fires on hydration rather than server render — a bounce before hydration is
  not counted. Server capture counted it, so absolute view counts will drop.
  That is a **change in what the number means**, and must be dated in PostHog.
- ⚠️ Client-side capture is blockable. Partially mitigated: events already
  proxy through `/ingest` on MAANTA's own origin.
- ⚠️ Still session-scoped only — a visitor returning tomorrow is a new person
  under any option except B.

**One thing to verify before committing to C:** that posthog-js `memory`
persistence mints a stable `distinct_id` reused across events within a tab. This
is what memory persistence is for and the library is configured with
`defaults: "2026-01-30"`, but **I have not proven it against posthog-js 1.406.2
in a browser**, and C is worthless if each event gets a fresh id. Confirm first;
it is a small check and it decides whether C is real.

## Recommendation

**Option C**, with A as the fallback if the verification above fails.

C is the only option that serves the D14 objective and the 2026-07-31 privacy
ruling at the same time. The register framed D88 as a binary — retire the path
or bring cookies back — and that framing conceded the funnel unnecessarily. The
identifier already exists in the browser; the defect is only that a *server*
event cannot see it. Moving the event to where the identifier already lives
solves it without touching storage, consent or legal copy.

## Whichever is chosen — the guard

D88's stated next step, and it is decision-independent in this form:

> Assert that `analytics-identity.ts`'s documented precondition matches the
> shipped `persistence` value, so the two cannot drift apart silently again.

Under A or C the module is deleted, so the guard becomes: **assert
`posthog-provider.tsx` still sets `persistence: "memory"`**, tying the Cookie
Notice's public claim to the shipped config. That guard is worth more than the
one D88 asked for — it protects a published legal statement, not just an
internal docblock.

Note this guard **cannot land before the decision**: written today against the
current tree it goes red immediately, which is a decision made by omission. That
is why this row was left open rather than "fixed with a test".

## Explicitly out of scope

- **D14** and the demo flag. Untouched.
- **`O6`** (Kenya DPA cross-border basis for Supabase `eu-west-1`) — separate,
  not started, and not a blocker for A or C.
- Any new event, provider, SDK, pixel or consent UI.
- Historical data. Whatever is chosen, events already captured with
  `distinct_id_source: 'none'` stay unattributable; the change is dated, not
  retroactive.

## Decision record

> **Decision: Option C** — move `deal_viewed` to client-side capture.
> **Ruled by:** founder · **Date:** 2026-08-10
> **Follow-up:** implement, add the `persistence` guard, close D88 with the
> commit and the guard path, and update D22's forward-looking wording.

### Verification of C's precondition — ✅ PASSED, 2026-08-10

Proven from the **posthog-js 1.406.2 source**, recovered from
`node_modules/posthog-js/dist/module.no-external.js.map` (`../src/storage.ts`).
Not inferred from the minified bundle and not assumed:

```ts
const memoryStorage: Properties = {}

// Storage that only lasts the length of the pageview if we don't want to use cookies
export const memoryStore: PersistentStore = {
    _get: function (name) { return memoryStorage[name] || null },
    _set: function (name, value) { memoryStorage[name] = value; return true },
    …
}
```

`memoryStorage` is a **module-level object**, so `distinct_id` is written once
and reused by every event in the same JS context. **C is real: the view and a
later claim land on one person.**

**The precise limit, in the library's own words.** Its comment says memory
storage lasts "the length of the **pageview**" — and `sessionStore`, defined
immediately below it, is documented by contrast as lasting "the length of a
tab/window. **Survives page refreshes.**" Memory does not. A hard reload or a
newly opened tab mints a fresh `distinct_id`.

**Why that does not undermine C.** What the funnel needs is that the *view* and
the *claim* share one context, and they do:

- `DealCard` renders `next/link` (`src/components/ui/claude/deal-card.tsx:89,150`),
  so `/feed` → `/deals/[id]` is a **client-side navigation** — context preserved.
- A deep link straight to `/deals/[id]` → claim is also one context.
- Only a hard refresh *between* viewing and claiming breaks the join.

That residue is cross-pageview stitching, which the 2026-07-31 cookieless ruling
already gave up deliberately. C recovers the within-visit funnel and claims
nothing more.

**Not verified in a browser here**, and it does not need to be for this
decision: the storage mechanism is the whole question and it is settled from
source. `@playwright/test` is not an installed dependency in this repo and the
vitest environment is `node` with no jsdom, so no in-browser run was available
without adding a dependency. Confirm event delivery on the preview or after
deploy, when the implementation lands.

---

## Implementation record — 2026-08-10

**Shipped**

| Change | File |
|---|---|
| `deal_viewed` captured client-side, once per mounted deal, with `capture_side: "client"` | `maanta-app/src/app/(shopper)/deals/[id]/deal-viewed-tracker.tsx` (new) |
| Server capture and its `currentClerkUserId()` fetch removed; node resolved server-side and passed down | `maanta-app/src/app/(shopper)/deals/[id]/page.tsx` |
| `captureDealViewed`, `DistinctIdSource`, `UNATTRIBUTED_DISTINCT_ID` removed; `resolveNode` exported as `resolveAnalyticsNode` so client and server agree on the fallback | `maanta-app/src/lib/analytics.ts` |
| Deleted — the module D88 was about, and its test | `analytics-identity.ts` + its suite |
| Guard | `maanta-app/src/lib/__tests__/analytics-cookieless.test.ts` (new, 4 assertions) |

**Every surviving `captureServerEvent` caller passes a real id** — a Clerk user
id or a merchant id, because each fires from an authenticated action. That is
why removing the anonymous fallback broke nothing: `guardian_outcome`,
`deal_claimed`, `deal_published`, `merchant_onboarded`, `topup_initiated`,
`topup_completed_mpesa`, `topup_completed_stripe`.

**The guard is aimed higher than D88 asked.** The row wanted an assertion tying
the deleted module's docblock to the shipped `persistence`. Since the module is
gone, the guard instead pins `persistence: "memory"` **to the public claim in
`/cookies`** — and asserts no server module reads a posthog cookie, and that
`deal_viewed` is not captured server-side again. Proven non-vacuous by flipping
persistence to `localStorage+cookie` and watching only that assertion fail.

### What this closure exposed about D21

The register guard failed the moment `analytics-identity.ts` was deleted:
**D21 cited it as closure evidence.** D21 was closed 2026-07-30 on that module,
and the cookieless ruling of 2026-07-31 neutralised it the next day — so D21 was
a closed row describing a defect that was live again, and nothing noticed for
ten days.

That is the register's own failure mode, worked: **a row closed against a code
path rather than against the behaviour, un-fixed by a config change elsewhere,
with its citation still resolving.** D21's evidence has been corrected in place
rather than left standing. The new guard is written to close that specific hole
— the un-fixing move now fails CI.

### Verification

`npm run lint` clean · `npm run typecheck` clean · `npm test` **648/648 across
86 files** · `npm run build` green including all four post-build gates ·
drift-register schema guard green.

Not run: `test:e2e` (needs `E2E_BASE_URL` + storage). Not verified in a browser,
for the reason given above — confirm event delivery after deploy, and check that
`deal_viewed` and a subsequent `deal_claimed` share a `distinct_id`.
