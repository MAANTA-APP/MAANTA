# PWA status — where the web app actually is (2026-08-12)

Reviewer session. Read-only audit of the PWA layer against the repository at
`main` @ `7b2b097`, plus the four drift rows it opened (**D91**–**D94**).

**One-line answer:** the PWA is an *installable shell*, not an offline app. The
manifest, the `start_url` role router and push notifications are built and
wired; there is no caching, no offline capability, no in-app install prompt any
more, and **no evidence anyone has ever measured that the install actually
works on a real phone.**

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
| Offline banner | Built, **copy is false** | `maanta-app/src/components/ui/states.tsx` |
| Offline caching | **Does not exist** | — |
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

### 2. The offline banner claims otherwise — on both money shells (**D92**)

`OfflineBanner` renders "You're offline — showing saved deals" and is mounted
on `(shopper)/layout.tsx` **and** `merchant/(app)/layout.tsx`. Given item 1,
nothing is saved: when that strip appears the page behind it can fetch nothing.
A merchant at a counter reads a promise the app cannot keep.

Two fixes, very different sizes, and the choice is a founder call:

- **(a) Copy** — say what is true ("You're offline — reconnect to load deals").
  One line, guardable as a string assertion.
- **(b) Behavior** — build a real caching service worker.

Recommendation: **do (a) now regardless.** Even after (b), a cached ticket
still cannot be redeemed offline, because `verify_redemption` is an RPC — so
the current wording would remain false even in a fully offline-capable build.

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

## Where this leaves the launch gate

The 3-person friends-and-family pilot at Node 0 does not depend on any of the
above: shoppers can use the app in a browser tab. Nothing in this audit is a new
launch blocker. But **the install experience is the part of the product a pilot
participant meets first**, and today nobody in the repo can say whether the
install button appears on their phone.

Cheapest sequence, in order:

1. Fix the offline copy (**D92a**) — one line, removes a false promise from a
   money surface.
2. Measure install on two real devices (**D93**) — ten minutes, settles whether
   the primary CTA is live or dead.
3. Add raster + maskable icons and `apple-touch-icon` (**D93**) — small, and
   needed whatever the measurement says.
4. Decide on the in-app install prompt (**D91**) and on offline caching
   (**D92b**) — both product decisions, neither urgent.

## Rows opened by this session

| Row | Status | What it records |
|---|---|---|
| **D91** | closed | `pwa-install.md` described a deleted bottom sheet and the wrong file for the Clerk redirect defaults; both corrected |
| **D92** | open | Offline banner promises saved deals; the SW has no cache |
| **D93** | open | Install funnel unmeasured; icon set is SVG-only, unpadded, declared maskable |
| **D94** | open | `/download` and `/app-bootstrap` are missing from `frames.json` |

## Related

- `docs/ops/pwa-install.md` — routes and install/bootstrap mechanics
- `docs/ops/tech-stack-deep-dive-2026-07.md` §PWA — the July stack position
- `docs/skills/frozen-ui-overall-handoff.md` — where the icon and offline-copy
  issues were first noticed, unregistered, in July
- `docs/maanta-drift-register.md` — D91–D94
