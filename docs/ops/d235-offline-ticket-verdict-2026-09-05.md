# Offline ticket verdict — verification record (2026-09-05)

**Status:** CURRENT — a verification of the founder's 2026-09-05 verdict on
offline ticket access, read against `main` at `88bd87e`, PR #317 at `37abee6`,
PR #318, and the production-facing docs. Register rows: **D276** (closed), **D277** and
**D278** (open).
**Audience:** founder, eng.
**Naming:** the verdict says "D235". On `main`, D235 is Merchant 360 (closed
2026-09-03). The offline row is PR #317's branch-local D235 and must be
renumbered when that work is extracted (take the next free number in the
register at that time). Two 2026-09-03 ops documents on `main` also use "D235" for the
offline row; the register's D223 row records the collision.

## The governing decision, verified

**Merchant 01: GO without offline tickets.** Verified. Nothing on `main`
caches a ticket: `maanta-app/public/sw.js` is 38 lines of push plumbing with no
`fetch` handler, `/my-deals` is `force-dynamic`, and the shopper shell's offline
banner reads "You're offline. Reconnect to load live deals." under the D92 guard
(`maanta-app/src/components/ui/__tests__/offline-banner.test.ts`). Neither the
readiness tracker, the Merchant 01 runsheet nor the day sheet lists offline
access as a gate. `docs/ops/remaining-engineering-audit-2026-09-03.md` §5 calls
it "not a blocker" in as many words.

**Offline feature: NO GO until the credentialed deployed test passes.**
Verified as the right bar, with one addition below (the test claim must be made
against a demo deal).

## Claim-by-claim

| Verdict claim | Finding |
|---|---|
| PR #317 proves the worker's caching strategy in real Chromium, 5/5 | **Corrected.** No CI workflow runs `test:e2e:sw`; the 5/5 is the authoring session's local run. Run as committed here (Playwright 1.56.1, the image's Chromium 1194) the suite is **3 passed, 2 failed**, twice. Cause: Playwright's `context.setOffline(true)` does not reach the service worker's own network stack, so the worker fetched live pages — the feed test saw `LIVE FEED`, the purge test saw the old code, and the passing "code survives" test passed for the same reason, not because the cache served it. With `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` the suite is **5/5**. The strategy is sound: under a **genuine outage** (harness process killed, no emulation) the cached code rendered, the feed fell to the offline page, and a purge left no code. Recorded as **D277** |
| `/my-deals` is network-first with a cached fallback | Verified in `sw.js`: `fetch` first, `caches.match` on failure, `/offline` as the last fallback |
| Feed, API requests and writes are not cached | Verified: non-GET and `/api/` are passed through untouched; only `/my-deals` is in the cacheable list; every other navigation gets the network or the precached `/offline` |
| Sign-out purges cached ticket pages under both auth strategies | Verified on the branch (`purgeCachedPages` awaited in both the Clerk and Supabase buttons, plus the worker-side purge message). **But** `main`'s sign-out button was rewritten since (D258/D260, one shared strategy-aware control), and the file conflicts — the purge must be re-applied there, not merged |
| CI, typecheck and build passed at the PR head | Verified: `ci` and `db-tests` green on `37abee6` at 2026-09-03 08:08 UTC — before PR #318 merged at 12:43, so never against current `main` |
| Ticket data is server-rendered, not client-fetched | Verified: the page selects `otp_code` server-side and passes formatted codes as props to the client list; no client fetch fills the row |
| The four unproven points (authenticated document, offline reload, hydration, notice) and cache clearing on the deployed app | Verified as unproven. The branch's own `e2e/offline-ticket.spec.ts` names exactly these and self-skips without `E2E_BASE_URL` + `E2E_SHOPPER_STORAGE` |
| Copy defect: "can still be scanned at the counter" | **Verified, and sharper than stated.** Staff *type* the code (`redeem-keypad.tsx`: "Enter the customer's 6-digit code"); the only QR is the merchant's, scanned by the shopper. The sentence also passes both guards by wording — the D92 patterns and the branch's three banned strings — so CI cannot catch it. The proposed replacement wording is right. Recorded in **D277** |
| 37 files, ~2,930 added lines | Verified: 37 files, +2,930 / −36, 11 commits |
| Reported by GitHub as conflicting | Verified: `mergeable_state: dirty`. Ten files conflict: the decisions log, the drift register, `.gitignore`, `package.json`, two marketing pages, `deals/[id]`, `sign-out-button.tsx`, `deal-kpis.tsx`, `data.ts`. Of the offline files only `sign-out-button.tsx`, `package.json` and `.gitignore` are among them; the worker, notice, registrar, purge helper, `/offline` page and all four offline test files merge clean |
| Branched from `c3b2fd3`; PR #318 landed since | Verified: merge-base is `c3b2fd3`; #318 merged 2026-09-03 and explicitly did **not** land the offline work ("No claim is made that authenticated offline ticket presentation works") |
| "The practical pilot mitigation remains: screenshot the code" | **Corrected.** It was written only in the 2026-09-03 audit, which said it was "already written down in `docs/ops/node0-known-limitations.md`". It never was, in any revision. Now added there (**D276**) |
| The screenshot mitigation itself | **Withdrawn — it fights a shipped fraud control (D278).** Raised by the Codex review bot on PR #328 and verified against three surfaces: the ticket screen's counter copy reads "If the timer isn't moving, it's a screenshot."; `claim-ticket-time.ts` calls that moving timer "an anti-fraud device merchants are trained on" and its test holds every band to one visible change per second; `/shoppers` promises the public "no arguing, no screenshots". A shopper following the instruction arrives with the artifact staff are trained to refuse |

## The mitigation had to change too (D278)

The verdict's mitigation and the 2026-09-03 audit's are the same sentence, and
both are unusable as written. The replacement is **open the ticket before
walking to the counter and leave that screen open** — not a new rule, a verified
mechanism: `claimed-code.tsx` takes `expiresAt` as a prop and reads
`useShopperClock`, which is a client clock seeded at server render and ticked by
its own one-second interval (`maanta-app/src/lib/use-shopper-clock.tsx`). An
already-open ticket therefore keeps ticking with the network gone, which is
precisely the liveness signal staff are trained on. Only a reload, a reopen or a
cold start needs the network, and that is the real limit.

What is **not** settled here, and is not engineering's to settle: whether the
screenshot mitigation is withdrawn everywhere it appears, or the anti-screenshot
control and the public promise are what change. That trades a fraud control
against counter recovery, and MAANTA has neither a fraud case nor a genuine
redemption yet to weigh either. **D278**, founder.

## What I ran

From a scratch worktree of PR #317 (`37abee6`), Node 22, Playwright 1.56.1,
`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`:

```
npm run test:e2e:sw                                   → 3 passed, 2 failed (run twice, same two)
PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 \
  npm run test:e2e:sw                                 → 5 passed
npx vitest run d235-claim-discipline offline-code-screen \
  offline-banner service-worker-behaviour             → 32 passed
```

Real-outage check (a throwaway script, not committed): start the harness, load
`/my-deals` until the worker controls the page, **kill the harness process**,
then reload.

```
online  /my-deals code:  4 8 2 9 1 6
-- origin killed --
OUTAGE  /my-deals code:  4 8 2 9 1 6   (served from cache)
OUTAGE  /feed marker:    OFFLINE PAGE   (feed never cached)
OUTAGE  after purge:     no code, OFFLINE PAGE
```

The two failing tests' page snapshots showed `LIVE FEED` and the old code
respectively, which is only possible if the worker's fetch reached the network
while the page was "offline".

## Conditions for the narrow branch (the verdict's step 4), as verified

1. Extract only the offline files onto current `main`; they merge clean except
   the sign-out purge, which is re-applied on the shared control.
2. Set `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` in the `test:e2e:sw`
   script (or replace emulated offline with a real origin stop) and reproduce
   5/5 on a fresh runner before citing the number.
3. Reword `TicketOfflineNotice` as the verdict proposes and extend the D92
   pattern list so "scanned" / "can still be" phrasing on an offline surface
   fails.
4. Renumber the row from the next free register number; it cannot be "D235" on `main`.
5. The deployed run needs a shopper holding an active claim. The Vercel preview
   shares production's Supabase project, so make that claim **against a demo
   deal**: a claim against a genuine merchant would enter the field counters
   (D188 — `redemptions.is_demo` is never set by `claim_deal`).

## Not done here

No product code was changed — including the anti-screenshot control and the
`/shoppers` promise, which stay exactly as they are pending the D278 ruling. PR #317 was neither closed nor rebased — that is
the founder's decision, and the verdict's step 3 stands. The scratch worktree
was removed.
