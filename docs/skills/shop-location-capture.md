# Shop location capture — "Locate my shop", and why what3words is optional

Status: written 2026-08-24 for **D162** (founder ruling the same day), and
**live on production the same day**: PR #268 merged as `14052ad` and migration
`20260824120000_merchant_location_coordinates.sql` applied under explicit
founder authorization, ledger **101/101**. Owner rule: **read the migration, the
route and `src/lib/shop-location.ts` before this doc** — they win.

## What changed and why

Self-serve merchant onboarding used to block on a what3words lookup. On
2026-08-23 a full-role production E2E found every lookup failing — including
what3words' own canonical `filled.count.soap` — with HTTP 402 `QuotaExceeded`.
The key was fine; the account was not. **The result was that no merchant could
finish signing up at all.**

That is the shape of the problem worth remembering: a third party's *billing
state* had become a hard dependency of the product's front door, on a screen the
merchant reaches before MAANTA has earned anything from them.

The ruling removes the dependency rather than paying it off. The merchant is
standing at their own shop entrance holding a device that already knows where it
is. That reading is better evidence of where the shop is than three words copied
off a sign, and it costs nothing per lookup.

**Coordinates are canonical. what3words is enrichment.** Restoring the quota
restores the words; it does not restore a requirement.

## The flow, and the six states it has to handle

`/merchant/onboard` step 2 → `LocateShopStep`
(`src/app/merchant/onboard/locate-shop-step.tsx`) → `ShopLocationMap`
(`src/components/merchant/shop-location-map.tsx`).

| State | What the merchant sees | What is stored |
|---|---|---|
| Idle | "Stand at your shop entrance… then tap Locate my shop" — the amber action | nothing |
| Granted | Coordinates, accuracy, a map with a draggable pin, a confirm checkbox | the pin, once confirmed |
| Denied (`code 1`) | "Location permission was declined… or place the pin on the map instead"; the map opens | whatever they place |
| Unavailable (`code 2`) | "Your device couldn't determine a location"; the map opens | whatever they place |
| Timeout (`code 3`) | "Step outside the shop door and try again"; the map opens | whatever they place |
| Coarse (> 100 m) | Rust-bordered note: "too broad to tell one shop from the next. Drag the pin onto your entrance" | the pin, once confirmed |

Four rules hold across all six:

1. **The position is requested only on tap.** There is no `watchPosition`
   anywhere in the flow and no effect that reaches `getCurrentPosition`; a guard
   asserts both. `maximumAge: 0` — a cached fix from the merchant's kitchen this
   morning is exactly the wrong answer.
2. **Confirmation is explicit and separate.** A position on screen is a
   proposal. Continue unlocks only on a ticked "The pin is on my shop entrance",
   and a *new* reading clears that tick, because a confirmation that refers to a
   position no longer on screen is not a confirmation.
3. **What is submitted is the confirmed pin**, which may be one the merchant
   dragged, never the device's first fix. The server stores the numbers it is
   given and does not re-derive them.
4. **Nothing dead-ends.** Poor accuracy warns and opens the pin; it never
   refuses. Refusing on a bad GPS reading would recreate exactly the failure this
   ruling removed.

## Where the rules live

| Concern | File |
|---|---|
| Every predicate — validity, accuracy policy, failure classification, the step gate, `shopNavigationTarget` | `maanta-app/src/lib/shop-location.ts` |
| The step UI and its six states | `maanta-app/src/app/merchant/onboard/locate-shop-step.tsx` |
| The map pin (tap to place, drag to adjust) | `maanta-app/src/components/merchant/shop-location-map.tsx` |
| The gate | `maanta-app/src/app/api/merchants/onboard/route.ts` |
| The invariants | `maanta-app/supabase/migrations/20260824120000_merchant_location_coordinates.sql` |

The decision logic sits in the lib **so it can be tested**: vitest runs in a
`node` environment, so there is no permission dialog to grant or deny, and logic
that exists only inside a click handler is logic nothing verifies.

## The database half

- `merchants.what3words_address` is **nullable**.
- `merchants_location_present` — `what3words_address IS NOT NULL OR (lat IS NOT
  NULL AND lng IS NOT NULL)`. A shop nobody can find is not a shop. This is what
  makes dropping the `NOT NULL` safe rather than a silent widening.
- `merchants_lat_lng_range` — WGS84 bounds. NaN fails it too: Postgres orders
  NaN above every finite value, so `NaN BETWEEN -90 AND 90` is false.
- `onboard_merchant` gained `p_lat` / `p_lng` and writes the location **in the
  same INSERT** as the shop row. It was previously a post-insert UPDATE whose
  failure was logged and swallowed — a locationless shop was one swallowed error
  away, which is the "Map pin unavailable" defect D162 describes on the
  admin-assisted path.
- Named raises (`location_required`, `invalid_coordinates`) so the route answers
  with an actionable 400 rather than a CHECK violation surfacing as a 500.

**Signature note.** This is the third shape `onboard_merchant` has had (11 → 12
→ 14 args). It is a `DROP` + `CREATE`, never an added overload with defaults:
two overloads make every existing call ambiguous, which is how `20260816020000`
first failed CI. `DROP` also discards grants, so the migration's `REVOKE`/`GRANT`
are load-bearing — without them PUBLIC inherits EXECUTE and the `20260816020000`
lockdown silently reverts.

## what3words, now that it is optional

- The wizard does not ask for it. The route derives it from the confirmed pin
  via `convertTo3Words`, bounded at **1500 ms**, and **every** failure — no key,
  over quota, provider down, slow, thrown — collapses to `NULL` and onboarding
  continues.
- `convertTo3Words` ran **unbounded** until this change, despite the module
  documenting the opposite (**D173**). Harmless while its only caller was the
  admin location editor; on the onboarding path it would have hung exactly the
  request this ruling protects.
- The admin location editor (`/api/admin/merchants/[id]/location`) still accepts
  either direction and is unchanged.

## What a nullable address broke, and how it is patched

A column that was `NOT NULL` for a year has read sites that assume it. Each of
these would have thrown `TypeError: Cannot read properties of null` on a
coordinate-only shop:

- `(shopper)/shops/[id]/page.tsx` and `(shopper)/tickets/[id]/page.tsx` built a
  what3words URL unconditionally. Both now use `shopNavigationTarget`, which
  prefers the words and falls back to the in-app map.
- `admin/merchants/[id]` rendered `W3wChip` with the raw value; it now shows
  coordinates, or says there is no location.
- The claim-path geofence in `api/redemptions/route.ts` passed the address
  straight to what3words. It now prefers the shop's **stored coordinates** and
  falls back to the words — otherwise the geofence would silently stop producing
  a distance for exactly the shops onboarded since this ruling.

**If you add a read of `merchants.what3words_address`, null-guard it.**

## Tests

| Suite | Covers |
|---|---|
| `maanta-app/supabase/tests/merchant_location_coordinates_test.sql` | coordinate-only onboarding (still `pending`), what3words-only still works, `location_required`, out-of-range + NaN + half-pair, direct-write constraints, exactly one RPC overload with grants intact, and a merchant unable to move another merchant's shop |
| `maanta-app/src/lib/__tests__/shop-location.test.ts` | validation, the four failure classifications, accuracy policy, the confirmation gate, navigation targets |
| `maanta-app/src/lib/__tests__/merchant-onboarding-geolocation.test.ts` | on-tap only, no `watchPosition`, confirmation required and cleared on a new reading, manual fallback present, rust warning, one amber action, leaflet client-only |
| D162 block in `maanta-app/src/app/api/merchants/onboard/__tests__/route.test.ts` | coordinates required, the confirmed pin stored verbatim, no second write to `merchants`, what3words unavailable / throwing / answering, cross-tenant scoping, approval untouched |

Verified on a fresh database (bare Postgres 16 + the Supabase shim described in
`docs/skills/merchant-self-onboarding.md`, because this container has no Docker
daemon): the full **101-migration** chain replays and **all 32 SQL suites pass**.
That is a mirror, not the gate — the CI `db-tests` job on a real Supabase stack
is what counts.

## Open, and deliberately not done

- **Live, but not yet proven by a real merchant.** The migration is applied and
  read back (ledger 101/101, column nullable, both CHECKs present, one 14-arg
  overload with grants intact), and a coordinate-only onboarding was exercised
  against the production function inside a rolled-back block. D162 stays `open`
  until one **genuine** merchant self-onboards at their BBS Mall entrance —
  deployment is not the closure event, live proof is.
- **No provenance columns.** Whether a pin came from the device or a merchant's
  finger, and how accurate the reading was, are shown to the merchant and then
  discarded. Storing them would help admin review; the ruling did not ask for it
  and the smallest change did not need it. If approval review later wants it,
  that is a column and a migration, not a redesign.
- **No geofence on submission.** A coordinate far from BBS Mall is accepted.
  Admin approval is the human gate, and refusing a merchant because their GPS
  drifted is the dead end this ruling removed. The field principle — be at the
  entrance when you tap — is enforced by the operator, not by a bounding box.
