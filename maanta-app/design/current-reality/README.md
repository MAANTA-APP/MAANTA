# Maanta — current-reality mirror (design-side contract)

`frames.json` is the contract artifact for audited current-state design truth.
`frames.schema.json` validates it. Everything else in this folder is instructions
for landing that contract in the app repo.

## Provenance — read this first

This mirror was **authored in Claude Design, not extracted from the repo.** Frames were
verified by reading `MAANTA-APP/MAANTA@main` (tree `118ba8ebdd84`, 2026-07-29) and the
canonical Notion pages. That verification is **manual and dated** — it is not generated,
and it will rot. Do not describe this file as repo-derived.

**Where this lives now.** `maanta-app/design/current-reality/` — this folder. It was authored
in the Claude Design project at `handoff/current-reality/` and landed here on 2026-07-29,
which is what closed drift **D-08**: Layer 1 (`src/lib/design-truth/`) now validates it on
every PR, so "the repo validates the contract" is a fact rather than an aspiration.
The human-readable view is `Maanta Current Reality.dc.html` in the Claude Design project;
**there is no `index.html` in this folder.** The contract is `frames.json` (21 frames) plus
its schema. If you were told it carries 45 frames or ships an `index.html`, neither is true
— see D-11.

Two facts to keep straight:

- The other design folder, **`maanta-app/design/claim-and-till/`**, mirrors a *different*
  Claude Design project and takes its screen map from `design/Maanta_Wireframe_System.pdf`.
  Useful, but not this artifact — and it is the source of the still-open D-07 conflict.
- Landing the mirror was not a copy. Every frame was re-read against the working tree, and
  the corrections are recorded in **D-13**: a stale route (`/tickets` → `/my-deals`), two
  `sourceFiles` paths that omitted the `(public)` route group, five smoke anchors naming
  copy the app does not render, and eleven states that already shipped but were recorded as
  missing. Repo outranks the frame, so the frame was corrected — not the app.

**Truth order, fixed:** Notion (product / current state) → repo (implementation) →
design system (visual, may describe an ideal ahead of shipped). A frame never overrules
the first two. The schema enforces this order in `mirror.truthOrder`.

## What the contract carries

21 frames, each with: `id`, `name`, `role`, `route`, `status`, `job`, `primaryAction`,
`runtimeRule` (an id into `runtimeRules`, never inline prose), `states`, `stateCoverage`,
`prototypeStatus`, `prototypeRef`, `captureReadiness`, `captureReadinessReason`,
`evidenceSource`, `sourceFiles`.

Three fields carry the review weight:

- **`stateCoverage`** is `{covered:[], missing:[]}`, not a ratio. `3/4` never told a reviewer
  *which* state was missing; `missing: ["expired"]` does.
- **`prototypeRef`** is the `role/screen` key of the screen that proves a `clickable` claim.
  Required whenever `prototypeStatus` is `clickable` — this is what makes a false coverage
  claim structurally impossible rather than merely discouraged.
- **`captureReadinessReason`** is required for every label except `safe-now`, so screenshot
  planning never has to guess what blocks a capture.

Plus, for smoke-eligible frames only: `smoke`, `expectedHeading` **or** `expectedAnchor`,
`requiredRole`, `authState`, and `redirectTarget` where a route is expected to bounce.

Enums are closed. `status` ∈ live · gated · blocked · rehearsal · design-ahead.
`captureReadiness` ∈ safe-now · after-copy · after-data · internal-only.
`prototypeStatus` ∈ clickable · blocked-design · blocked-product · blocked-code ·
current-not-clickable.

## How it is validated in the repo

Three **separate** layers, so a failure names itself.

### Layer 1 — static contract (`src/lib/design-truth/`) — **built**

- `schema.ts` — Zod mirror of `frames.schema.json`. Types come from `z.infer`; there is no
  hand-maintained parallel `interface`, because a second declaration is how a mirror starts
  lying. Carries anti-fake-sync rules 1–7 plus a partition check on `stateCoverage` (a state
  in neither list, or in both, hides a coverage gap).
- `load.ts` — reads and parses `frames.json` once, and throws with the frame **`id`** in the
  message rather than `frames[7]`, which costs a reviewer a counting exercise.
- `routes.ts` — walks `src/app` into the URL paths it actually serves, dropping route groups
  (`(shopper)`) and matching `[id]` positionally against any dynamic segment name.
- `design-truth.contract.test.ts` — 19 assertions: schema parse, fixed truth order, design-
  authored provenance, every `runtimeRule` / `driftId` / `supersedes` resolving, unique ids,
  no orphan rules, every `sourceFiles` entry on disk, **every `route` resolving to a real
  `src/app` page** (the check that catches a stale route name), founder/admin surfaces
  internal-only, no smoke on unshipped behaviour, every enum value exercised or listed in
  `ALLOWED_UNUSED` with a reason, and four checks that Layer 2 is still generated from the
  contract — including one that fails if a route literal is hardcoded in the spec.

Run it with `npm run test:design-truth`. It is a step in `.github/workflows/ci.yml`, ahead
of the main suite, so a lying mirror is the first thing a reviewer sees.

### Layer 2 — behavioural smoke (`e2e/design-truth-smoke.spec.ts`) — **built**

Driven **from the contract** — never re-declare a route in a test:

```ts
for (const frame of loadFrames().filter(f => f.smoke)) {
  test(`${frame.id} ${frame.name} [${frame.role}]`, async ({ page }) => {
    await signInAs(page, frame.requiredRole, frame.authState);
    await page.goto(resolveRoute(frame.route));            // fills [id] from seed data
    if (frame.redirectTarget) await expect(page).toHaveURL(new RegExp(frame.redirectTarget));
    const anchor = frame.expectedHeading
      ? page.getByRole('heading', { name: frame.expectedHeading })
      : page.getByText(frame.expectedAnchor!, { exact: false });
    await expect(anchor).toBeVisible();
  });
}
```

Accessible locators only — `getByRole`, `getByLabel`, visible text. No CSS or
`data-testid` unless a screen genuinely offers no user-facing anchor, and then prefer
adding a real heading or `aria-label` to the app over adding a test hook.

**14** of 21 frames are `smoke: true`: 13f, 8f, 8g, 8j, 10a, 13j, 13h, 10b, 13a, 13b, 13d,
11a, 13e, 12a. (An earlier revision of this file said "12 of 21" above the same 14 ids; the
count was wrong, the list was right. Layer 1 derives the number from the contract rather
than trusting prose.) They cover every role and the whole money path (claim → code →
verify → wallet). The rest are deliberately route-only — see *Still route-only* below.

### Layer 3 — process integration — **built**

```json
"scripts": {
  "test:design-truth":        "vitest run src/lib/design-truth",
  "test:design-truth:smoke":  "playwright test e2e/design-truth-smoke.spec.ts",
  "test:design-truth:all":    "npm run test:design-truth && npm run test:design-truth:smoke"
}
```

Layer 1 is pure and runs on every PR (`ci.yml`). Layer 2 needs a seeded non-prod
environment, so it is an opt-in job in `e2e.yml` gated on the `E2E_DESIGN_TRUTH`
repository variable, running after the golden path (both drive the same mutable backend).
`npm run test:e2e` is scoped to `e2e/golden-path.spec.ts` so the existing golden-path job
keeps its two-role setup.

**Smoke prerequisites — fail loudly, never skip silently.** Two failure modes,
deliberately different:

- **Nothing configured** (`E2E_BASE_URL` unset): nobody asked for a smoke run, so the file
  skips with a reason. It never reports a pass. Without this, `npm test` would be
  permanently red on any machine with no seeded backend.
- **Partly configured**: someone *is* running smoke, so a missing account or seed row
  throws `missing test role: agent` / `missing seed row: /deals/[id] (set E2E_SEED_DEAL_ID)`.
  A run that silently covers 9 of 14 frames is worse than no run, because the green tick
  gets read as coverage. `e2e.yml` also pre-checks the full set so the failure names the gap
  before Chromium starts.

What the run needs, against a non-prod project:

- `E2E_BASE_URL`, and a non-prod Supabase project (`NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`) — the target-host guard in `e2e.yml` refuses `maanta.app`.
- Storage states for the six test users: `E2E_STORAGE_SHOPPER` (aliases the golden path's
  `E2E_SHOPPER_STORAGE`), `E2E_STORAGE_SHOPPER_UNVERIFIED_PHONE`, `E2E_STORAGE_MERCHANT`
  (aliases `E2E_MERCHANT_STORAGE`), `E2E_STORAGE_MERCHANT_STAFF_NO_VERIFY`,
  `E2E_STORAGE_AGENT`, `E2E_STORAGE_ADMIN`. `12a` is anonymous and gets a clean context.
- Seed rows for the four `[id]` routes: `E2E_SEED_DEAL_ID` (a claimable deal),
  `E2E_SEED_TICKET_ID` (a claimed ticket), `E2E_SEED_LEAD_ID` (an open lead),
  `E2E_SEED_HELD_REDEMPTION_ID` (a held redemption). A pending shop is needed for `11a`,
  which is a static route and needs no id.

## Anti-fake-sync checks

Seven are already enforced by the schema, so a bad mirror cannot even parse:

1. A `smoke: true` frame **must** declare `requiredRole`, `authState`, and an anchor.
2. Any blocked `prototypeStatus` **must** carry a written `prototypeBlockedReason`.
3. A `design-ahead` frame **must** set `evidenceSource: repo-partial` and link a `driftId`.
4. A `design-ahead` frame **may not** be smoke-tested — smoke asserts shipped behaviour.
5. Founder and admin frames **must** be `captureReadiness: internal-only`.
6. A `clickable` `prototypeStatus` **must** carry a `prototypeRef` naming the screen.
7. Any `captureReadiness` other than `safe-now` **must** carry a `captureReadinessReason`.

Three more belong in Layer 1, because they need the filesystem:

8. Every `smoke: true` frame has a generated test — the spec iterates `smokeFrames()`, and
   Layer 1 asserts it still does, so a smoke-marked frame can never sit uncovered. Layer 1
   also fails if a route literal is hardcoded in the spec, which is the only way the two
   could disagree while both stayed green.
9. Every `route` resolves to a real page, and every `sourceFiles` path exists. This is what
   catches a `design-ahead` frame quietly becoming live without a status change.
10. No field in the schema is unexercised: each declared enum value appears at least once
    across the mirror, or is listed in `ALLOWED_UNUSED` with a written reason.

One more the schema enforces beyond the original seven: `stateCoverage` must **partition**
`states`. A state in neither `covered` nor `missing` is an undeclared gap, and a state in
both is a contradiction — either way the ratio a reviewer reads is wrong.

## Capture readiness

For marketing and documentation. Follows current demo-data reality, not future polish.

| Label | Meaning |
|---|---|
| `safe-now` | Capture as-is. |
| `after-copy` | Reads correctly but carries unresolved copy (payment order, launch offer, example-code framing). |
| `after-data` | Correct, but marketplace density is seeded during Node 0 rehearsal. |
| `internal-only` | Shows money owed, lead contact details, or ops tooling. Never public. |

Every label except `safe-now` carries a `captureReadinessReason`. Only three frames are
`safe-now` today: 13f verify-phone, 10a redeem, 12a landing. Both founder and all admin
frames are `internal-only` by schema rule, so no ops surface can leak into marketing.

## Prototype coverage

18 of 21 frames are `clickable` and name a `prototypeRef`. Three are not, each with a
written reason:

| Frame | Status | Why |
|---|---|---|
| M8 Create deal | `blocked-code` | Recorded as "the repo create flow has no charge-disclosure step" — **this reason is stale**, see D-13: `new-deal-wizard.tsx` ships a mandatory charge-disclosure step. Needs a founder ruling, not a silent status flip. |
| 11e Support | `current-not-clickable` | Desktop ops surface, intentionally outside the phone prototype. |
| 12e Pricing | `current-not-clickable` | Launch-offer copy unresolved; building it would bake in a number that may change. |

Founder and guardian surfaces are desktop in production and are rendered compact in the
phone prototype. That is a deliberate compromise, noted rather than hidden.

## Still route-only, and why

| Frame | Reason |
|---|---|
| 13g Browse | Map surface; anchor depends on seeded geo data. |
| 8l My deals | Covered transitively by 8j; low marginal value. Route corrected to `/my-deals` (D-13). |
| 13i Top-up | Payment provider order unresolved (D-06) — an anchor now would lock in the wrong primary method. Card is primary in code today because Stripe is the only rail that completes. |
| 13k Alerts | Alert copy still moving. |
| M8 Create deal | `design-ahead`; schema forbids smoke on unshipped behaviour (D-03). |
| 11e Support | Desktop ops surface, outside the phone prototype. |
| 12e Pricing | Launch-offer copy unresolved. |

## Open blockers

- **D-07 geofence bands (product decision) — STILL OPEN, but not the fork it was recorded
  as.** The row says claim-and-till documents verify-anyway on a mismatch while the frames
  show a hard rejection with no fee, and one must be wrong. **Both ship, at different
  distances.** Guardian geofence has two bands in `app_config.guardian_thresholds`:
  `> warn_m` (250 m) → `flag`, redemption succeeds, KES 30 applies, a `guardian_events` row
  is logged — claim-and-till's behaviour; `> hard_m` (2000 m) → `hard_block`, declined at the
  counter, no fee, admin-appealable — the frames' behaviour. Neither document named a
  threshold, so each described one band. The surviving defect is narrower: the merchant
  warning in `preflight/route.ts` uses its own hardcoded 150 m, so between 150 m and 250 m the
  cashier is warned but Guardian returns `clear` — no flag, no event row, no dispute trail —
  and Guardian is live-tunable while that constant is not. Nothing was changed. Full analysis
  and the three ways to close it: `docs/skills/design-truth-contract.md` §D-07.
- **D-06 payment order (code).** Design system says M-Pesa is always primary; the shipped
  rail is Stripe Checkout pending IntaSend credentials, so card carries the primary action on
  `/merchant/topup` today. `TODO(D-06)` in `topup-flow.tsx` marks the reorder.
- **D-13 contract corrections (product decision).** The corrections listed above were applied
  because the repo outranks the frame. One item was not: whether M8 create-deal is now `live`.
- **D-14 agent onboarding link (code).** Frame 13b recorded a "Send onboarding link" primary
  action with nothing behind it. Not built — it needs an attribution decision first.
- **D-15 admin rejected state (code).** Frame 11a declares a `rejected` state, but
  `merchants.status` is CHECK-constrained to `pending / active / suspended / churned`.
  Showing it needs a migration, so it is left uncovered rather than faked against `suspended`.
- **D-08 provenance — CLOSED.** The mirror is committed here and Layer 1 runs on every PR.
