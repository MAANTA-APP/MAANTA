# PR 2 — Merchant Counter Mode: pre-implementation reconnaissance (2026-08-26)

Founder-authorized reconnaissance only. **No code written.** Read against
`origin/main` @ `231aff9` (PR 0 merged), with production read-only checks.

## 1. Current counter architecture

`/merchant/redeem` is the merchant app's **default landing tab**. Server
component (`redeem/page.tsx`, force-dynamic) resolves the merchant context and
success fee, counts paused-but-active deals, and renders three things in order:

1. a paused-deals notice bar (only when a paused active deal exists);
2. `<QueuePanel />` — **only** when `permissions.can_verify`;
3. `<RedeemKeypad balance fee canVerify />`.

Around it, `merchant/(app)/layout.tsx` renders `DemoModeBanner` →
`OfflineBanner` → `MerchantTopBar` (shop name + wallet pill) →
`MerchantLifecycleBanner` → content (`pb-24`) → `MerchantBottomBar`
(Redeem · Deals · Wallet · More). Frame is `max-w-mobile`, widening to
`lg:max-w-3xl`.

**The keypad is a four-screen state machine**: `keypad` → `disclose` →
`success` | `rejected`, plus a transient `verifying`. Money moves only from an
explicit Confirm on `disclose`.

## 2. Existing components / routes / RPCs

| Kind | Thing | Role |
|---|---|---|
| Page | `merchant/(app)/redeem/page.tsx` | server shell |
| Component | `redeem/queue-panel.tsx` | waiting-shopper list, 8s poll |
| Component | `redeem/redeem-keypad.tsx` (~473 ln) | the whole verification flow |
| Component | `components/ui/redemption-result.tsx` | success takeover |
| Lib | `lib/queue.ts` | TTL, poll cadence, `staffFacingName`, `liveWaitingRedemptionId`, `QueueEntry` |
| Lib | `lib/queue-code-handoff.ts` | in-memory tap→keypad handoff (D193) |
| Route | `GET /api/queue` | staff queue read (service client, `merchant_id` scoped) |
| Route | `POST /api/queue/dismiss` | drop a row; claim untouched |
| Route | `POST /api/redemptions/preflight` | resolve a code → fee disclosure data |
| Route | `POST /api/redemptions/verify` | the ONLY money path |
| Route | `POST /api/qr/check-in` | arrival + queue insert |
| RPC | `verify_redemption` | redemption + KES 30 fee authority |
| RPC | `record_shopper_arrival` | arrival stamp + persisted Fast Visit verdict |
| RPC | `award_fast_visit_points` | points, after a `success` redemption |
| Table | `merchant_presentations` | ephemeral queue, 10-min TTL |
| Column | `merchants.qr_token` | 32-hex CSPRNG, one per merchant |

## 3. What already works (do not rebuild)

- **Queue**: oldest-first, no FIFO lock (any row tappable), first-name +
  last-initial only, deal title, relative arrival, dismiss without touching
  the claim, 10-minute TTL, redeemed/expired rows dropped by the live-redemption
  join, and — importantly — **failed first load ≠ empty** (an honest muted
  retry line, D164/D185).
- **Tap → keypad handoff** never puts the OTP in the URL (D193); the tapped
  code runs the *identical* preflight → disclosure → Confirm path as typing.
- **Manual 6-digit entry** is the primary flow and is never gated on the queue;
  the queue panel is additive and absent entirely without `can_verify`.
- **Verify-anyway**: Confirm is never disabled by wallet state; an underfunded
  fee becomes disclosed arrears.
- **Success takeover** shows fee, new balance, collect-amount, Nairobi-time
  verification stamp, masked phone, copyable reference, auto-skip countdown.
  Failure is dark `#141414`, never red, and says when no fee was charged.
- **Tenant isolation**: both queue routes scope by `merchant_id` from the
  authenticated context, never the request body.

## 4. Exact UX gaps

| # | Gap | Evidence |
|---|---|---|
| G1 | **No recent verifications at the till.** After auto-skip the keypad resets blank; history is one nav level away at `/merchant/redemptions`. Staff cannot answer "did that one go through?" without leaving the screen. | `redeem-keypad.tsx` resets to `{kind:"keypad"}`; only `dashboard/page.tsx` has a "Recent activity" list |
| G2 | **Fast Visit is plain inline text** — `" · Fast Visit"` appended to a muted secondary line, no chip, no icon, no weight. Fails the "state = icon + word, readable in greyscale" rule. | `queue-panel.tsx` row body |
| G3 | **No rendered QR anywhere.** The dashboard prints the `/qr/<token>` URL as mono text. Nothing to show a shopper, nothing to print. | `dashboard/page.tsx` QR card |
| G4 | **No printable counter/entrance sheet.** No print stylesheet, no A5/A4 layout, no shop name + instruction. | absent |
| G5 | **Confirm has no double-tap guard.** `confirmRedemption` does not consult the existing `submitting` ref (used only for keypad auto-submit) and the button has no `disabled`. A fast double-tap can fire two POSTs; the server is safe (second gets `redemption_already_verified` → 409) but the **second response can overwrite the success screen with "already redeemed"** — a success that reads as a failure at the counter. | `redeem-keypad.tsx:160-161`, Confirm at ~335 |
| G6 | **Queue has no loading state.** `entries === null` with no failure renders `null`, indistinguishable from "nobody waiting" during the first fetch. | `queue-panel.tsx` |
| G7 | **Dismiss is unconfirmed and irreversible in the UI.** One mis-tap removes a waiting shopper from the list with no undo (the claim survives, so recovery is "ask them to rescan"). | `queue-panel.tsx` |
| G8 | Queue is invisible on the dashboard/other tabs — staff standing on any other tab get no waiting-shopper signal. | scope of `QueuePanel` |

## 5. Proposed screen layout (smallest field-ready change)

```
[ paused-deals notice, unchanged ]

SHOPPER QUEUE                              3 waiting
┌────────────────────────────────────────────────┐
│ Amina H.                          [Fast Visit] │  ← chip, not inline text
│ Summer Abaya · arrived 1m ago         Dismiss  │
└────────────────────────────────────────────────┘
   (loading → 2 skeleton rows; empty → nothing;
    first-load failure → existing muted retry line)

ENTER CODE
      [ _ _ _ _ _ _ ]        ← unchanged keypad
      (Confirm now guarded against double-tap)

RECENT                                            ← new, this session only
  Amina H. · Summer Abaya — verified 2 min ago
  Yusuf M. · Shoes — verified 14 min ago
      View all redemptions ›
```

Plus, on the **dashboard QR card only**: the rendered QR image, a "Print
counter QR" link opening `/merchant/qr/print` — a dedicated print-first page
(shop name, large QR, one instruction line, `@media print` rules) that works
from a phone to a mall print shop.

## 6. Files expected to change

**New:** `merchant/(app)/qr/print/page.tsx`; `components/merchant/counter-qr.tsx`
(renders the QR); `components/merchant/recent-verifications.tsx`;
`lib/qr-svg.ts` *if* hand-rolled (see §9); tests alongside each.

**Modified:** `redeem/page.tsx` (fetch last N verifications server-side and pass
down); `redeem/queue-panel.tsx` (Fast Visit chip, loading skeleton, dismiss
confirm); `redeem/redeem-keypad.tsx` (Confirm double-tap guard — smallest
possible change, reuse the existing `submitting` ref); `dashboard/page.tsx`
(render the QR + print link in the existing card).

**Not touched:** every RPC and migration, `/api/redemptions/verify`,
`/api/qr/check-in`, `lib/queue.ts` semantics, `lib/pricing.ts`.

## 7. Security boundaries (all unchanged by the proposal)

- **Scanning the QR remains arrival/presentation evidence only.** Verified in
  code this session: `/api/qr/check-in` calls `record_shopper_arrival` and
  nothing else — it never calls `verify_redemption` and never calls
  `award_fast_visit_points`. Points require `status = 'success'`, which only
  `verify_redemption` sets. The QR cannot redeem and cannot pay.
- `record_shopper_arrival` and `award_fast_visit_points` remain
  service_role/postgres only (D192); `merchants.qr_token` remains unreadable by
  anon/authenticated (D147).
- Recent-verifications data is read **server-side** through the existing
  service client scoped by `merchant_id`, and shows the same minimised identity
  the queue does (`staffFacingName`) — no full names, no phone beyond the
  already-masked value.
- The printable QR renders a token the owner dashboard **already** discloses to
  that owner. No new exposure, no widening of who can read it. The print page
  must be owner-gated exactly like the existing QR card.
- **Same QR at entrance and till stays safe, as previously ruled.** The token
  identifies the merchant and authorizes nothing; the shopper's own state
  decides what the landing page does. Nothing in this proposal changes that,
  and PR 2 must not introduce a second token or a location-specific token.

## 8. Test plan

- `counter-qr.test.ts` — the rendered QR encodes exactly the `/qr/<token>` URL;
  a malformed/absent token renders the existing "no QR yet" state, never a
  broken image.
- `recent-verifications.test.ts` — renders minimised identity only; empty state
  vs **read-failure** state are distinct (D164/D185 ratchet); no money figure is
  coloured or celebrated.
- `queue-panel.test.ts` (extend) — loading ≠ empty ≠ failed; Fast Visit chip
  renders only when `fastVisitEligible`.
- `redeem-keypad` double-tap: a test that fires Confirm twice and asserts
  exactly one POST to `/api/redemptions/verify`.
- Source ratchets: the QR print page must not import anything that fetches
  cross-origin; `/api/qr/check-in` must never reference `verify_redemption` or
  `award_fast_visit_points`.
- Full existing set: lint, typecheck, unit, build + 3 post-build gates, and the
  36-suite SQL run (unchanged, but run to prove nothing regressed).
- Responsive smoke at 320px/375px, slow network, and offline.

## 9. Printable QR — dependency question

**No QR capability exists today** — no `qrcode`, no `qrcode.react`, nothing
transitive. Two options:

- **Preferred: `qrcode` (or `qrcode.react`) pinned, used server-side to emit an
  inline SVG.** Small, mature, no runtime fetch, no external host (the artifact
  CSP/self-contained rule and the marketing no-external-asset posture both
  favour inline SVG over an image service).
- **Alternative: hand-rolled QR encoder** (~200–300 lines for byte-mode + ECC).
  Zero dependency, but hand-writing Reed–Solomon for a money-adjacent surface
  is a worse risk than a well-maintained library.

**Recommendation: one small pinned dependency, server-rendered to SVG.**
Explicitly rejected: any hosted QR image API (leaks the token to a third party
and breaks offline printing).

## 10. Drift discovered during reconnaissance

- **G5 (Confirm double-tap)** is a genuine defect, not a polish item — it can
  show "already redeemed" *after* a successful verification. Money is safe
  (fee charged once, server-side). Proposed as the highest-value item in PR 2;
  if the founder prefers, it is small enough to split out on its own.
- No new drift rows opened. **D194** (dead `tier_flags` audit) and **D195**
  (UI vs trigger active-deal count) remain open and untouched, and neither
  intersects PR 2 — see §11.

## 11. D194 / D195 reconciliation into the sequence

- **D194** — belongs with **PR 4** (admin operations console), which is the
  first package that would *read* an audit trail. Fixing it earlier builds a
  writer with no reader.
- **D195** — belongs with **PR 3**, whose wizard pre-flight needs one canonical
  active-deal count anyway; that is the moment the choice must be made
  deliberately. Not PR 2: the counter never displays an active-deal count.

## 12. Migration requirement: **NO**

Everything proposed reads existing columns and tables. No schema change, no
RPC change, no grant or RLS change, no production write.

## 13. Recommended PR 2 scope

**In:** Confirm double-tap guard (G5) · recent verifications strip (G1) ·
Fast Visit chip (G2) · queue loading state (G6) · rendered QR + print page
(G3, G4) · small-screen and offline hardening.

**Out (proposed deferrals):** dismiss-confirm (G7) — low value, adds a tap to
the busiest surface; queue visibility on other tabs (G8) — needs a global
signal and belongs after field evidence says staff actually miss arrivals.

Awaiting founder authorization. Nothing implemented.
