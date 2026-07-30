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
| 8f Deal feed | `R-FEED-ORDER` | Rails renamed to the frozen names: **Flash deals**, **Priority placements**. Third section was left pending D-01 and is now **Deals Near Me** — see `docs/skills/feed-deals-near-me-2026-07-29.md`. Order unchanged. |
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

## Drift rows closed against the repo (2026-07-29)

Each was re-verified against current `main` before the row was touched — the repo
wins for implementation, so a row claiming something is unbuilt when it ships is
the row that moves.

| Row | Claimed | Actually | Evidence |
|---|---|---|---|
| D-02 | See-all screens have no matching route | `/search?type=flash` and `?type=boosted` are the shipped destinations; the filter sheet can represent both | `feed/page.tsx:140,162`; `search/page.tsx:26,44,46` |
| D-03 | Archive with repost/delete not in the codebase | Ships, and both writes are `can_deals`-gated | `deals/archived/{page,archived-actions}.tsx`; `api/deals/repost/route.ts:12`; `api/archive/[id]/route.ts:10` |
| D-04 | Elite 2-deal limit stated but enforcement unconfirmed | Enforced in Postgres (`standard→1`, `elite→2`, over `is_active = TRUE`, raising at `>=`), mirrored in the UI | `20260630231915_maanta_schema_v3_baseline.sql:318-343`; `src/lib/deal-limits.ts:25-27` |
| D-05 | Frames model four permissions, repo has a coarser gate | All four booleans exist and each is enforced server-side and mapped to UI | `20260709175532_deal_pause_boosts_staff.sql:305-318`; `merchant-api.ts`; `merchant-nav.ts:34-40` |
| D-08 | No mirror in the repo; CI validation is aspiration | Mirror committed; Layer 1 runs on every PR | `design/current-reality/`; `src/lib/design-truth/` |

All five are now `historical / blockedOn: none`, with the evidence recorded in
`landedInRepo.corrections`.

### The fifth finding: M8 was misclassified

Closing D-03 forced this, because **M8 was `design-ahead` pointing at D-03** — a
row describing a *different* feature (archive), which had already shipped. A
frame held back by a closed drift row is held back by nothing.

Checking it, M8's `prototypeBlockedReason` was also factually wrong. It said "the
repo create flow has no charge-disclosure step". The step ships and is
**unskippable**:

- `new-deal-wizard.tsx:51` — `extrasChoice` starts `null`, so neither option is preselected
- `:80-84` — `priceReady` requires an explicit choice; Continue is disabled until then
- `:375` — the charge question itself, with "You will not be able to add charges at the counter"
- `:487-491` — live preview of the summed total
- `:619-620` — `Publish — shoppers pay KES {previewPay}`

The frame's own `stateCoverage` already said `missing: []` for all four states —
internally contradicting `design-ahead`.

**M8 is now `live` / `evidenceSource: repo` / no `driftId`**, with
`prototypeStatus: current-not-clickable` and an accurate reason (not in the phone
prototype). It stays `smoke: false` deliberately: reaching the wizard depends on
a free deal slot and a positive balance, so there is no stable anchor state to
assert.

### Guards added so none of this silently reopens

- **A `design-ahead` frame must link an OPEN drift row.** This is the generic
  invariant that would have caught the M8 incoherence, and it is the one worth
  keeping — it makes "shelved for a reason that no longer exists" a CI failure.
- D-02, D-03, D-04, D-05, D-08 are each asserted `blockedOn: none`.
- `status: design-ahead`, `prototypeStatus: blocked-code` and
  `evidenceSource: repo-partial` are now unexercised enum values, listed in
  `allowedUnused` with the reason — a future unshipped frame reintroduces all
  three and must link an open drift row.

Both new guards were negative-tested: restoring M8 to `design-ahead`/`D-03` and
reopening D-04 produced exactly two targeted failures.

### Still open, legitimately

| Row | Blocked on | Why it stays open |
|---|---|---|
| ~~D-01~~ | ~~product-decision~~ | **Closed 2026-07-29** — founder decided: Deals Near Me, proximity-led standard deals. |
| D-06 | code | M-Pesa-primary vs Stripe Phase 1 — blocked on IntaSend credentials, not engineering. |
| D-12 | prototype | Admin support (11e) and public pricing (12e) are intentionally documentation-only. |

The README's "12 of 21 frames are `smoke: true`" is also a miscount — the list it
gives has 14 ids, and 14 is what the contract carries and what Layer 2 generates.

## Verification

`npm run lint` · `npm run typecheck` · `npm test` (**458 passing**) ·
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
