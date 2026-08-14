# PWA status — where the web app actually is (2026-08-12)

Audit of the PWA layer against the repository at `main` @ `7b2b097`, plus the
five drift rows it opened (**D91**–**D95**), plus the one copy fix shipped in
the same session.

**One-line answer:** MAANTA is an *installable, online-first shell*. It is not
an offline application and is not becoming one. The manifest, the `start_url`
role router and push notifications are built and wired; there is no caching, no
in-app install prompt any more, and **no evidence anyone has ever measured that
the install actually works on a real phone.**

**Changed since this doc was first written (2026-08-12, same day):** the
offline banner no longer claims deals are saved — **D92** closed. Founder
instruction was explicit: correct the wording, build no offline feature. Full
offline caching is **deferred**, tracked as **D95**, and untouched.

Nothing here was verified against production. This session's egress proxy
blocks `www.maanta.app`, so every statement below is a repository fact.

## What exists, file by file

| Piece | State | Path |
|---|---|---|
| Web app manifest | Built | `maanta-app/public/manifest.webmanifest` |
| `manifest` link + theme colour | Built | `maanta-app/src/app/layout.tsx` |
| Service worker | Built, **push only** | `maanta-app/public/sw.js` |
| Install hook (`beforeinstallprompt`) | Built | `maanta-app/src/lib/pwa/usePwaInstall.ts` |
| Install landing `/download` | Built | `maanta-app/src/app/(marketing)/download/` |
| `start_url` role router `/app-bootstrap` | Built, tested | `maanta-app/src/app/app-bootstrap/`, `maanta-app/src/lib/pwa/app-bootstrap.ts` |
| Push opt-in sheet | Built | `maanta-app/src/app/(shopper)/feed/notification-opt-in.tsx` |
| Offline banner | Built, **copy corrected + guarded** | `maanta-app/src/components/ui/states.tsx` |
| Offline caching | **Does not exist — deferred (D95)** | — |
| In-app install prompt | **Deleted 2026-08-06** | was `src/components/install-prompt.tsx` |
| Raster icons / `apple-touch-icon` | **Do not exist** | — |
| Any device or Lighthouse measurement | **Never run** | — |

## The five things worth knowing

### 1. The service worker does not cache. At all.

`public/sw.js` is 38 lines: a `push` listener and a `notificationclick`
listener. No `fetch` handler, no Cache Storage, no precache. The app is online-
only. `docs/ops/tech-stack-deep-dive-2026-07.md` already says this in plain
words — the July stack review called it "correctly scoped to push" and
explicitly deferred full offline caching as optional product work, not a scale
prerequisite. That judgement still looks right; what is not right is item 2.

### 2. The offline banner used to claim otherwise — fixed (**D92** closed)

`OfflineBanner` rendered "You're offline — showing saved deals" on
`(shopper)/layout.tsx` **and** `merchant/(app)/layout.tsx`. Given item 1,
nothing was saved: when that strip appeared the page behind it could fetch
nothing, and a merchant at a counter read a promise the app cannot keep.

**Founder instruction, 2026-08-12: correct the wording, build no offline
feature.** Both halves were done exactly as scoped.

The component now maps an `OfflineContext` prop to three approved strings, and
each shell passes its own:

| Context | Copy |
|---|---|
| `shopper` | You're offline. Reconnect to load live deals. |
| `merchant` | You're offline. Reconnect before verifying a redemption. |
| `generic` | You're offline. Reconnect to continue. (default) |

Context is a prop rather than a route sniff, so the component never guesses
which shell it is in, and a new shell that forgets the prop gets the line that
is safe anywhere rather than a promise it cannot keep.

Accessibility improved in the same diff, because the old form was effectively
silent: the banner used to `return null` when online, inserting the live region
and its text in the same tick. The region is now mounted at all times and only
its text changes, `aria-live="polite"` so a connectivity flap queues behind
whatever the user is doing instead of interrupting a merchant mid-verification.
Online it renders an unclassed empty wrapper — no height in either flex column,
no styling, layout or routing change.

Guarded by `maanta-app/src/components/ui/__tests__/offline-banner.test.ts`:
strings asserted verbatim, each string tested against nine offline-claim
patterns, and every `.tsx` under `src/` plus every `.md` under `src/content/`
scanned for the same patterns, so the promise cannot reappear on an empty
state, a toast or a legal page. Proven to fail before being trusted —
reinstating the old string failed all three ratchets.

**Caching was not built and is not planned** — see item 6.

### 3. Nothing prompts installation any more (**D91**)

`InstallPrompt`, the auto bottom sheet on home, was deleted in the 2026-08-06
dead-code sweep because nothing imported it. The only remaining install surface
is `/download`, reached deliberately from the footer and three marketing CTAs.
`docs/ops/pwa-install.md` still described the bottom sheet as mounted until this
session; that is now corrected.

Open decision, not drift: **should the app re-offer install anywhere but
`/download`?** For a product whose whole shopper flow happens inside a mall on a
phone, a single opt-in page is a thin funnel. The counter-argument is CLAUDE.md's
own bar — one clear primary action per screen, no nagging — and the sweep was
right that an unimported component is dead weight. This needs a decision, not a
re-implementation by default.

### 4. The install funnel has never been measured (**D93**)

`/download` leads with **"Add Maanta to my phone"**, which renders only when
`canInstall` is true — that is, only when Chrome fires `beforeinstallprompt`.
Chrome's installability criteria have historically required a service worker
with a `fetch` handler, and ours has none. **If that requirement still holds,
the primary CTA on the install page never renders in production** and every
visitor falls through to the manual "Android: … iPhone: …" instructions card.

This is deliberately stated as unverified. It cannot be settled from the repo,
and this environment could not reach either production or the Chrome docs. It is
the single highest-value open question in the PWA layer, and it costs one phone
and ten minutes to answer:

1. Chrome on Android → open `/download` on production → does the install button
   render? (Equivalently: Lighthouse → Installability.)
2. iOS Safari → Share → Add to Home Screen → what icon appears, and does the
   launcher land on `/app-bootstrap`?

Record both in **D93** with date and build SHA.

Also repo-measurable and independent of that answer: the manifest declares one
icon, `/icon.svg`, as `"purpose": "any maskable"`, and the SVG's artwork runs to
all four edges of its 48×48 viewBox — so Android's maskable safe zone crops the
shield. There is no 192/512 PNG anywhere, no `apple-touch-icon`, and no
`appleWebApp` metadata.

### 5. What is genuinely solid

`/app-bootstrap` is the best-built part of this layer. It branches correctly on
auth strategy (Clerk's `useAuth()` would throw under the Supabase strategy),
handles signed-out, 401, non-OK and network-error paths with a stated
destination for each, and `destinationForRole` is unit-tested across all seven
roles plus unknown and missing. Push is real end-to-end: opt-in sheet → VAPID
subscribe → `/api/push/subscribe` → `sw.js` notification with a click-through
URL, and the readiness tracker marks web push ✅.

### 6. Offline caching is deferred, deliberately (**D95**)

Not "not done yet" — **deferred, by founder instruction on 2026-08-12**, with
the wording fixed instead. Nothing was built and nothing is in progress: no
service-worker `fetch` handler, no Cache Storage, no Workbox, no IndexedDB, no
offline queue, no background sync.

The decision to take later is narrower than "make the PWA work offline" sounds,
and it is worth stating before anyone scopes it: caching would let a shopper
*read* a claimed ticket without a network, and would still not let them claim
or redeem one, because `claim_deal` and `verify_redemption` are RPCs. The
ceiling on this work is read-only resilience, not an offline product.

Reassess after the Node 0 pilot reports whether connectivity at the counter is
actually a problem. `docs/ops/tech-stack-deep-dive-2026-07.md` already treats
full offline caching as optional product work rather than a scale prerequisite,
and nothing found since contradicts that.

## Where this leaves the launch gate

The 3-person friends-and-family pilot at Node 0 does not depend on any of the
above: shoppers can use the app in a browser tab. Nothing in this audit is a new
launch blocker. But **the install experience is the part of the product a pilot
participant meets first**, and today nobody in the repo can say whether the
install button appears on their phone.

Cheapest sequence, in order:

1. ~~Fix the offline copy~~ — **done 2026-08-12, D92 closed and guarded.**
2. Measure install on two real devices (**D93**) — ten minutes, settles whether
   the primary CTA is live or dead. **This is now the top item, and it cannot be
   done from a repository.**
3. Add raster + maskable icons and `apple-touch-icon` (**D93**) — small, and
   needed whatever the measurement says.
4. Decide on the in-app install prompt (**D91**) and on offline caching
   (**D95**) — both product decisions, neither urgent.

## Rows from this session

| Row | Status | What it records |
|---|---|---|
| **D91** | closed | `pwa-install.md` described a deleted bottom sheet and the wrong file for the Clerk redirect defaults; both corrected |
| **D92** | closed | Offline banner promised saved deals; copy corrected per shell, guarded, accessibility fixed |
| **D93** | open | Install funnel unmeasured; icon set is SVG-only, unpadded, declared maskable. **Needs devices — do not close from repo evidence** |
| **D94** | open | `/download` and `/app-bootstrap` are missing from `frames.json` |
| **D95** | deferred | Offline caching deferred by founder instruction; owner founder, reassess after the Node 0 pilot |

## Related

- `docs/ops/pwa-install.md` — routes and install/bootstrap mechanics
- `docs/ops/tech-stack-deep-dive-2026-07.md` §PWA — the July stack position
- `docs/skills/frozen-ui-overall-handoff.md` — where the icon and offline-copy
  issues were first noticed, unregistered, in July
- `docs/maanta-drift-register.md` — D91–D94
