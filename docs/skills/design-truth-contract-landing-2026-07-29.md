# Skills: landing the real current-reality contract

Date: 2026-07-29 · Session mode: **Builder** · Branch: `claude/maanta-role-hardening-62ut64`

The audited `Maanta Current Reality` mirror arrived as a zip and is now committed.
This closes drift **D-08** and **replaces** the reconstruction an earlier session
had put in the same folder.

## What replaced what

An earlier session could not reach the artifact and built an honestly-labelled
reconstruction there instead: 48 frames, a different schema, an `index.html`, and
`src/lib/__tests__/design-truth.test.ts`. **All of that is now deleted.** The real
contract is 21 frames on a richer schema and ships no `index.html`; the mirror's
own README calls out the reconstruction's wrong details (frame count,
`index.html`, claiming the folder already existed) under D-08/D-11. The
reconstruction is not preserved — it was a stand-in, and keeping two contracts
would be the exact failure the mirror is designed to prevent.

## Landed

```
maanta-app/design/current-reality/
  frames.json          21 frames · 18 runtime rules · superseded · drift
  frames.schema.json   closed enums + 7 anti-fake-sync conditionals
  README.md            provenance, landing plan, capture readiness
```

`frames.json` gained one repo-side field, `landedInRepo` (date, `closesDrift`,
`corrections`), so every correction made while landing it carries its evidence.

## The three layers

| Layer | Path | Command |
|---|---|---|
| 1 — static contract | `src/lib/design-truth/{schema,load}.ts` + `design-truth.contract.test.ts` | `npm run test:design-truth` |
| 2 — behavioural smoke | `e2e/design-truth-smoke.spec.ts` | `npm run test:design-truth:smoke` |
| 3 — process | package.json | `npm run test:design-truth:all` |

Layer 1 is 109 assertions and needs only the filesystem, so it gates every PR.
`schema.ts` is a Zod mirror of `frames.schema.json` with all seven
anti-fake-sync rules as `superRefine` checks; types come from `z.infer`, so
there is no parallel interface to drift. `zod` was added as a **devDependency** —
nothing in the app runtime imports it.

Layer 2 generates one test per `smoke: true` frame **from the contract** — 14
tests, no route or anchor restated in the spec. It fails loudly: a missing role
throws `missing test role: agent` rather than skipping.

## Contract corrections (repo wins for implementation)

Layer 1 caught all five on first run.

| Frame | Field | Was | Now | Evidence |
|---|---|---|---|---|
| 8l | `route` | `/tickets` | `/my-deals` | `src/app/(shopper)/my-deals/page.tsx` exists; no `(shopper)/tickets/page.tsx` |
| 8l | `sourceFiles` | `(shopper)/tickets/page.tsx` | `(shopper)/my-deals/page.tsx` | same |
| 12a | `sourceFiles` | `src/app/page.tsx` | `src/app/(public)/page.tsx` | landing is in the `(public)` group |
| 12e | `sourceFiles` | `src/app/pricing/page.tsx` | `src/app/(public)/pricing/page.tsx` | pricing is in the `(public)` group |
| 13j | `sourceFiles` | `(app)/staff/page.tsx` only | + gate component + redeem page | the gate renders at `/merchant/redeem` when `can_verify` is false; `/merchant/staff` is where the owner grants it |

## Frame work shipped

| Frame | Rule | Change |
|---|---|---|
| 8f Deal feed | `R-FEED-ORDER` | Rails renamed to the frozen names: **Flash deals**, **Priority placements**. Third section left as "All active deals" — its label is unresolved (D-01), so the repo's wording stands. Order unchanged. |
| 13f Verify-phone | `R-PHONE-BEFORE-CLAIM` | Entry heading → **"Verify your phone"**. |
| 8j Claimed code | `R-GRACE` | Card label → **"Show this code"**. Card still holds only label + code + countdown (R6). |
| 13j Staff verify gate | `R-VERIFY-PERMISSION` | New `StaffVerifyGate` screen: **"You can't verify codes"** + a **Contact the owner** action (WhatsApp when the shop has a number). Replaces the generic permission notice at `/merchant/redeem`. Server guards untouched. |
| 13b Agent lead detail | `R-AGENT-NO-SUBMIT` | New `SendOnboardingLink`: shares the existing `/merchant/onboard` route by WhatsApp or clipboard. **The agent never submits the shop's form** — the merchant authenticates and submits. No backend added. |
| 13e Guardian detail | `R-REVERSAL-NOTE` | **"Release hold"** heading above the actions. The button keeps `Release & charge fee` — the fee stays disclosed before it is taken. |
| 12a Landing | `R-TAGLINE` | Exact tagline **"Discover, Claim and Redeem."** rendered. |

## Not done, and why

- **10a wrong-shop branch — RESOLVED, no code change.** Founder ruling
  2026-07-29: verify-anyway is correct — a mismatch still redeems and the dispute
  goes to admin. **The frames were wrong**; the repo already did the right thing
  (`preflight` returns `locationMismatch` + distance and still resolves the code;
  the keypad discloses it as a warning and records a reason on confirm; Guardian
  receives the dispute). The wrong-shop hard-reject branch is superseded and must
  not be built. See the "D-07 resolution" section below.
- **M8 Create deal** — `design-ahead`. Not built (`TODO(D-03)`); the schema
  forbids smoke on unshipped behaviour.
- **The full visual restyle** — the frames' palette (`#F5F2EB` paper, `#000`,
  `#E8431F` urgency, `#141414` merchant failure surface) differs from the shipped
  Frozen-UI tokens in `tailwind.config.ts`. Retokenising is a separate, larger
  pass; this session did copy, anchors, states and structure only. Nothing here
  changed a colour token.
- **`stateCoverage.missing` states** — 23 states across 12 frames are still
  unbuilt. They are listed per frame in the contract, which is now the worklist.

## Drift rows that look stale against the repo

Reported, not silently changed — each needs a founder call on whether the mirror
or the classification moves:

- **D-04 (Elite 2 active deals, "enforcement not confirmed")** — enforcement
  exists: `enforce_deal_limit` in
  `supabase/migrations/20260630231915_maanta_schema_v3_baseline.sql:318-343`
  raises on the 2nd/3rd active deal, and `src/lib/deal-limits.ts` mirrors it in
  the UI.
- **D-05 (staff permission granularity, "repo has a coarser gate")** — the repo
  has all four booleans (`can_verify`, `can_deals`, `can_topup`, `can_purchase`)
  in `merchant_staff`, mapped to UI in `src/lib/merchant-nav.ts`.
- **D-03 (archive repost/delete "not found in the codebase")** — both ship:
  `POST /api/deals/repost`, `DELETE /api/archive/[id]`, `archived-actions.tsx`.
- **D-02 (see-all screens "no matching route")** — `/search?type=flash` and
  `?type=boosted` are both queried and linked from the feed.

The README's "12 of 21 frames are `smoke: true`" is also a miscount — the list it
gives has 14 ids, and 14 is what the contract carries and what Layer 2 generates.

## Verification

`npm run lint` · `npm run typecheck` · `npm test` (**445 passing, 50 files**) ·
`npm run build` — all green. `npx playwright test --list` resolves 31 tests
across 3 spec files, 14 of them generated from the contract.

One existing copy-lock test moved with the contract:
`src/__tests__/cash-only-and-copy.test.ts` now asserts frame 13f's heading.

## D-07 resolution (founder ruling, 2026-07-29)

**Verify-anyway is correct.** A location mismatch still redeems; the dispute goes
to admin. The design frames and the phone prototype both showed wrong-shop as a
hard rejection with no fee — that branch is **superseded**.

The decisive finding: **the shipped code was already right, so nothing was
built.** Evidence, in call order:

| Step | Where | Behaviour |
|---|---|---|
| Resolve | `api/redemptions/preflight/route.ts:59-62` | Flags `locationMismatch` (geofence flag **or** distance > 150 m) and still returns `found: true` with `distanceMeters`. Not a rejection. |
| Disclose | `redeem-keypad.tsx:298-303` | Rust `InlineAlert` — "Claimed away from your shop… confirm only if the customer is standing at your counter (Nm away)". Calm, not red. |
| Confirm | `redeem-keypad.tsx:316-323` | Confirm records `Location mismatch (Nm from shop) — merchant confirmed customer at counter`. The fee is disclosed above it (`R-RESOLVE-THEN-CHARGE`). |
| Charge | `api/redemptions/verify/route.ts` | Fee applies — the redemption **is** verified (`R-FEE-ON-VERIFIED`). Returns `disputed`. |
| Review | `/admin/redemptions/[id]` (13e) | Guardian holds/releases/reverses, note required (`R-REVERSAL-NOTE`). |

### Changed

- `runtimeRules.R-VERIFY-ANYWAY` — rewritten from "DISPUTED … Unresolved" to the
  settled statement. Leaving the old text would have kept inviting someone to
  build the superseded branch.
- Drift `D-07` — `current-mismatch / product-decision` → `historical / none`,
  detail recording the ruling and that the frames, not the code, were wrong.
- Frame `10a` — gained the `location-mismatch` state it has always rendered but
  never declared; `stateCoverage.covered` now lists all seven.
- All three recorded in `landedInRepo.corrections` with evidence.

### Pinned so it cannot silently reopen

- `preflight/__tests__/route.test.ts` — 4 new cases: geofence flag still
  resolves; distance alone past the threshold flags; a shopper inside the shop
  does not; a **missing** distance is not treated as suspicious (legacy rows and
  shops without GPS must not be punished at the counter).
- `design-truth.contract.test.ts` → "settled rulings stay settled": the rule text
  may not contain `DISPUTED`/`Unresolved`/`D-07` again, 10a must keep the
  mismatch state covered, and D-07 must stay `blockedOn: none`.
- `docs/maanta-decisions-log.md` — ruling logged with its code references.

Suite after this change: **452 passing**.
