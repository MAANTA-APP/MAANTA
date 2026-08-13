# PWA real-device pilot checklist (D93)

Created 2026-08-12. **Run this on real phones.** Nothing in it can be answered
from the repository, which is exactly why the row it feeds is open.

**What this is for:** `docs/ops/pwa-status-2026-08-12.md` found that MAANTA's
install funnel has never been measured. `/download` leads with **"Add Maanta to
my phone"**, a button that renders only when Chrome fires `beforeinstallprompt`.
Chrome's installability criteria have historically required a service worker
with a `fetch` handler, and `maanta-app/public/sw.js` has none. So the primary
call to action on the install page may never appear in production, and no one
knows. This checklist settles that, and eight related questions, in about
twenty minutes with two phones.

**Rule for whoever runs it: do not close D93 from source inspection.** Close or
update it only from recorded device evidence — the versions, the observed
behavior, and the build you tested. A reasoned argument about what Chrome
probably does is what left this open for weeks.

> **D93 and `docs/ops/pwa-status-2026-08-12.md` are both introduced by PR
> #200**, which was still open when this file was written — this checklist is
> on its own branch and may land first. If `docs/maanta-drift-register.md` has
> no rows D91–D95, or the status doc is missing, that PR has not landed yet.
> The tests below are unaffected; only the row you record into is.

## Before you start

**Change nothing.** No code, no manifest, no service worker, no icons, no
analytics, no production configuration, no database. This is a measurement
session. If a test reveals a defect, write it down and stop — fixing it is a
separate change with its own review.

**Take no live business action.** This runs against production, where the fee
machinery is real:

> Do not create, claim, redeem, verify, top up, purchase, or otherwise consume
> a live offer while completing this checklist.
>
> Do not create merchant fees, redemption records, financial events, or
> operational data merely to test installation, routing, push reachability, or
> offline messaging.
>
> If a step would require a live business action, stop and record it as a
> blocker rather than performing it.

Every test below is satisfied by signing in and navigating. None of them needs
a claim or a redemption, and a KES 30 success fee raised to prove an icon
rendered is a real debit against a real merchant wallet.

You need:

- One **Android phone** with **Chrome**.
- One **iPhone** with **Safari**. Not Chrome on iOS — it is a WebKit shell and
  installs differently.
- Both on a normal mobile network or Wi-Fi, not a VPN or a corporate proxy.
- A sign-in that works on production. A **shopper** account covers most of the
  list; if a merchant account is available, repeat §4 and §7 with it.

Record the build you are testing before you touch anything, so the evidence
means something six weeks from now:

- The production URL you used (`https://www.maanta.app` — not a preview alias).
- The deployed commit SHA, from the Vercel deployment serving that alias.
- Date and time, with timezone.

## What the repo says should happen

Stated here so a tester does not have to read source, and so a **mismatch is
visible rather than rationalised**. If reality differs from this column, that is
the finding — write down what you saw, not what should have happened.

| Thing | Repo says | Where |
|---|---|---|
| `start_url` | `/app-bootstrap` | `maanta-app/public/manifest.webmanifest` |
| Display | `standalone` | same |
| Theme colour | `#FDBF2D` (amber) | same, and `src/app/layout.tsx` |
| Icon | one SVG, `/icon.svg`, declared `"any maskable"` | same |
| Service worker | push + notification click only, **no caching** | `maanta-app/public/sw.js` |
| Install CTA | renders only if `beforeinstallprompt` fired | `src/lib/pwa/usePwaInstall.ts` |
| Fallback | manual Android/iOS instructions card | `src/app/(marketing)/download/download-install-panel.tsx` |

Role destinations after `/app-bootstrap` (`src/lib/pwa/app-bootstrap.ts`):

| Role | Lands on |
|---|---|
| `customer` | `/feed` |
| `merchant_admin`, `merchant_staff` | `/merchant/dashboard` |
| `admin` | `/admin` |
| `agent` | `/agent` |
| `founder`, `cofounder` | `/founder` |
| unknown or missing | `/feed` |

Production runs **demo mode**, so deal rows are synthetic and a demo banner
shows inside the app shells. That is expected and is not a defect.

---

## 1. Does `/download` expose an install path?

**This is the headline question.** Everything else on this list is secondary to
it.

**Android / Chrome**

1. Open `https://www.maanta.app/download` in Chrome. Use a fresh tab, not a
   restored session.
2. Record which of these you see:
   - [ ] An amber **"Add Maanta to my phone"** button, or
   - [ ] The **"Add to your home screen"** card with Android/iPhone text
     instructions.
3. If you got the instructions card, wait ten seconds and reload once —
   `beforeinstallprompt` can arrive after first paint. Record whether the
   button appears on the reload.
4. Independently, open Chrome's ⋮ menu and record whether it offers **Install
   app** / **Add to Home screen**. Chrome's own menu entry and the page's
   button are different mechanisms and can disagree — that disagreement is
   itself worth recording.

**iPhone / Safari**

5. Open the same URL. iOS never fires `beforeinstallprompt`, so the
   instructions card is the **expected** result, not a failure. Record that it
   rendered and that the iPhone line is present and correct.

**Record:** which UI appeared on each device, whether a reload changed it, and
what Chrome's own menu offered.

**Optional and useful if you have a laptop:** Chrome DevTools → remote-debug
the Android phone → Application → Manifest, and read the **Installability**
section. It states the reason in words when a site is not installable, which
converts this whole section from an inference into a quote.

## 2. Does installation complete?

**Android**

1. Install by whichever route §1 offered — the page button if it appeared,
   otherwise the Chrome menu.
2. Record whether a confirmation dialog appeared and what name it showed. The
   manifest's `short_name` is `Maanta`.
3. Record whether the icon reached the home screen or only the app drawer.

**iPhone**

4. In Safari, tap the **Share** button in the browser toolbar, then scroll the
   share sheet if necessary and choose **"Add to Home Screen."** If the option
   is absent, record that outcome and the device/iOS version; do not infer the
   cause.
5. Record the name pre-filled in the dialog.
6. Confirm and record whether the icon reached the home screen.

**Record:** completed or not, on each device, plus the name shown.

## 3. Does the installed app launch standalone?

Launch from the home-screen icon, not from the browser.

- [ ] Android: does it open **without** Chrome's address bar and tabs?
- [ ] iPhone: does it open **without** Safari's address bar and bottom toolbar?
- [ ] Is the status-bar / toolbar tint amber (`#FDBF2D`), or default?
- [ ] Does the back gesture work inside the app, and does it ever dump you into
  the browser?

A window that still shows browser chrome means `display: standalone` is not
taking effect — record it plainly rather than deciding why.

## 4. Does `/app-bootstrap` route correctly?

The manifest's `start_url`, so this is the **first screen an installed user
ever sees**. Test it from the installed icon, both signed out and signed in.

**Signed out**

1. Sign out, then launch from the icon.
2. Expected: a brief "Opening Maanta…" then `/login?next=/app-bootstrap`.
3. Record what you actually got, including any flash of a wrong screen.

**Signed in**

4. Sign in, then launch from the icon again.
5. Record the role of the account and where it landed, against the role table
   above.
6. Note how long the "Opening Maanta…" screen was visible. It fetches
   `/api/me` before routing, so a slow network shows it longer — that is
   expected, but a screen that never resolves is not.

**If a merchant account is available**, repeat 4–6 with it and confirm it lands
on `/merchant/dashboard`.

## 5. Icon appearance

The manifest declares one SVG, drawn to all four edges of its viewBox, as both
`any` **and** `maskable`. The concern is that Android's maskable safe zone
crops the shield and check mark. Look, do not reason.

- [ ] Android home screen: is the icon the amber rounded square with the black
  shield, and is any part of the shield or check **cut off**?
- [ ] Android app drawer and recents: same question — the mask can differ.
- [ ] iPhone home screen: does a real icon appear, or a generic globe / a
  screenshot of the page? iOS behavior with an SVG-only manifest and no
  `apple-touch-icon` is precisely what is unverified.
- [ ] Photograph both home screens. **A screenshot settles this permanently;**
  a description does not.

## 6. Push opt-in accessibility

Signed in as a shopper, open `/feed` and wait — the opt-in sheet appears about
1.2 seconds in, once per device (it stores a dismissal in `localStorage` under
`maanta_notif_optin_dismissed`, so clear site data to see it again).

- [ ] Does the sheet appear at all?
- [ ] With **TalkBack** (Android) or **VoiceOver** (iOS) on: is the sheet
  announced when it opens? Are the heading, body and both buttons reachable and
  readable?
- [ ] Can you dismiss it **without** granting, and does it stay dismissed after
  a relaunch?
- [ ] If you grant permission: does a system permission prompt appear, and does
  the sheet close cleanly afterwards?
- [ ] Does anything about the app break if you **deny**? It is written to be
  best-effort and must never block the feed.

Do not send a test push as part of this session — that touches production
notification state and is out of scope here.

## 7. Truthful offline messaging

**Sequencing matters, and getting it wrong will produce a false result.** The
offline copy fix is PR #200. Before it is deployed, production still shows the
**old** banner. So:

- Check the deployed SHA from your "Before you start" notes.
- **If #200 is not yet live**, you will see `You're offline — showing saved
  deals`. That is the known defect, not a new finding. Record the SHA and move
  on; re-run this section after the deploy.
- **If #200 is live**, the strings below are what must appear.

Put the phone in **airplane mode** while the app is open, then:

- [ ] Shopper `/feed` shows a black strip reading exactly
  **"You're offline. Reconnect to load live deals."**
- [ ] Merchant shell shows exactly
  **"You're offline. Reconnect before verifying a redemption."**
- [ ] Nothing anywhere claims deals are saved, cached, or available offline.
- [ ] With TalkBack / VoiceOver on: is the banner announced when connectivity
  drops, and does it stay quiet rather than repeating if the connection flaps?
- [ ] Turn airplane mode off: does the strip disappear on its own?

Also record, without treating it as a bug: **what the page behind the banner
does offline.** MAANTA has no caching, so navigation is expected to fail. The
question worth answering is whether it fails *understandably* or leaves a blank
screen — that observation is what a future D95 decision would be scoped from.

## 8. Versions and blockers

Record for **each** device, every time:

- Device model.
- OS version (Android 14, iOS 17.4, and so on).
- Browser version — Chrome ⋮ → Settings → About Chrome; iOS Safari follows the
  OS version.
- Network type (Wi-Fi / 4G / 5G) and rough signal.
- Whether the phone had ever visited maanta.app before, and whether you
  cleared site data first. A returning device can behave differently from a
  fresh one, and "fresh install" is the case that matters for a pilot
  participant.

For every blocker, write: what you did, what you expected from the table
above, what happened, and a screenshot. **"Didn't work" is not evidence.**

---

## Recording the result

1. Write the run up as `docs/ops/pwa-device-test-<YYYY-MM-DD>.md` — one file
   per session, with the device table, the eight sections, and the photos
   referenced.
2. Update **D93** in `docs/maanta-drift-register.md` with what was measured,
   the device and browser versions, and the deployed SHA.
3. **Close D93 only if the evidence supports it**, and only from device
   evidence. If §1 shows the install button never renders on Android, D93 does
   not close — it sharpens into a stated defect with a known cause, which is a
   far better row than the open question it replaces.
4. Anything found that is not about install goes in the register as its own
   row, not folded into D93.

### The evidence threshold for closing D93

> D93 may be closed only after results are recorded from both:
>
> 1. at least one Android device using Chrome; and
> 2. at least one iPhone using Safari.
>
> Evidence from only one platform is useful but does not close D93.

The two platforms install by materially different mechanisms — Chrome fires
`beforeinstallprompt` and can offer installation through its own menu, while
iOS has no install event at all and depends entirely on a manual Share → Add to
Home Screen. A pass on one says nothing about the other, so a single-platform
run leaves half the funnel unmeasured.

If installation **fails, or cannot be offered at all, on either platform**, D93
stays open. The exact device and browser evidence then becomes the basis for a
separate remediation decision — not a closure, and not a fix improvised during
the session.

## Related

- `docs/ops/pwa-status-2026-08-12.md` — the audit that opened D93, and the
  current state of every part of the PWA layer
- `docs/ops/pwa-install.md` — install and bootstrap mechanics
- `docs/maanta-drift-register.md` — D91–D95
- `docs/ops/live-pilot-3-person-2026-07-30.md` — the pilot this feeds
