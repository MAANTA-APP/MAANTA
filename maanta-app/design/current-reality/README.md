# Maanta — current-reality mirror (design-side contract)

`frames.json` is the contract artifact for audited current-state design truth.
`frames.schema.json` validates it. Everything else in this folder is instructions
for landing that contract in the app repo.

## Provenance — read this first

This mirror was **authored in Claude Design, not extracted from the repo.** Frames were
verified by reading `MAANTA-APP/MAANTA@main` (tree `118ba8ebdd84`, 2026-07-29) and the
canonical Notion pages. That verification is **manual and dated** — it is not generated,
and it will rot. Do not describe this file as repo-derived.

**Where this actually lives.** `handoff/current-reality/` inside the Claude Design project.
It is **not** at `maanta-app/design/current-reality/` — that path does not exist on `main`.
The human-readable view is `Maanta Current Reality.dc.html` at the project root; **there is
no `index.html` in this folder.** The contract is `frames.json` (21 frames) plus its schema.
If you were told this folder is already in the repo, or that it carries 45 frames, or that it
ships an `index.html`, none of that is true — see drift D-08 and D-11.

### Provenance as of the audit date (pre-landing, kept as history)

Both of these were **true when the contract was audited and are no longer true** — this
folder is the thing whose absence they record. Drift **D-08** tracked exactly that gap and
is now closed; see `landedInRepo` in `frames.json`.

- At audit time there was **no `maanta-app/design/current-reality/`** on `main`: a search
  across all 579 files matched `frames.json`, `current-reality` and `design-truth` **zero
  times**. That is why the contract had to be carried in by hand rather than diffed.
- The repo's only design folder was **`maanta-app/design/claim-and-till/`**, which mirrors
  a *different* Claude Design project and takes its screen map from
  `design/Maanta_Wireframe_System.pdf`. Still useful, still not this artifact.

**Truth order, fixed:** Notion (product / current state) → repo (implementation) →
design system (visual, may describe an ideal ahead of shipped). A frame never overrules
the first two. The schema enforces this order in `mirror.truthOrder`.

## What the contract carries

22 frames, each with: `id`, `name`, `role`, `route`, `status`, `job`, `primaryAction`,
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

## Landing it in the repo

Copy this folder to `maanta-app/design/current-reality/`. Then build three **separate**
layers so a failure names itself.

### Layer 1 — static contract (`src/lib/design-truth/`)

- `schema.ts` — Zod mirror of `frames.schema.json` (single source: generate types with
  `z.infer`, do not hand-maintain a parallel `interface`).
- `load.ts` — reads and parses `frames.json` once, throws on first invalid frame with the
  frame `id` in the message.
- `design-truth.contract.test.ts` — parses the file, asserts every `runtimeRule` resolves
  to a key in `runtimeRules`, every `sourceFiles` entry exists on disk, every `driftId`
  resolves to a `drift[].id`, every `supersedes` resolves to a `superseded[].id`, and
  every `route` resolves to a real `src/app` page (walk the app dir; map `[id]` to any
  dynamic segment). **This is the check that catches a stale route name in the mirror.**

### Layer 2 — behavioural smoke (`e2e/design-truth-smoke.spec.ts`)

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

**18 of 22** frames are `smoke: true`: 13f, 8f, 8g, 8j, 10a, 13j, 13h, 13i, 10b, 13a, 13b,
13d, 11a, 13e, 11e, 12a, 12d, 12e. They cover every role and the whole money path
(claim → code → verify → wallet). The rest are deliberately route-only — see *Still
route-only* below.

Do not hand-maintain this number against the list: `mirror.frameCount` is asserted equal
to `frames.length` in Layer 1, and the generated-test count is asserted equal to the
`smoke: true` count. An earlier version of this paragraph claimed 12 while listing 14 ids,
which is what prompted both assertions.

### Layer 3 — process integration

```json
"scripts": {
  "test:design-truth":        "vitest run src/lib/design-truth",
  "test:design-truth:smoke":  "playwright test e2e/design-truth-smoke.spec.ts",
  "test:design-truth:all":    "npm run test:design-truth && npm run test:design-truth:smoke"
}
```

Layer 1 is pure and runs anywhere — put it on every PR. Layer 2 needs a seeded non-prod
environment; run it on a schedule or a label, not on every commit.

**Smoke prerequisites — fail loudly, never skip silently.** Assert these in a
`beforeAll` and throw with the missing name:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — non-prod project only.
- `CLERK_SECRET_KEY`, and a test-user set: shopper, shopper-unverified-phone, merchant,
  merchant-staff-no-verify, agent, admin.
- Seed rows for the `[id]` routes: one claimable deal, one claimed ticket, one held
  redemption, one open lead, one pending shop.
- `E2E_BASE_URL`.

If a role account is missing, the test must fail with `missing test role: agent`, not
pass by skipping.

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

6. Every `smoke: true` frame has a generated test — assert the generated test count equals
   the smoke count, so a smoke-marked frame can never sit uncovered.
7. Every `route` resolves to a real page, and every `sourceFiles` path exists. This is what
   catches a `design-ahead` frame quietly becoming live without a status change.
8. No field in the schema is unexercised: assert each declared enum value appears at least
   once across the mirror, or is explicitly listed in an `allowedUnused` array with a reason.

## Capture readiness

For marketing and documentation. Follows current demo-data reality, not future polish.

| Label | Meaning |
|---|---|
| `safe-now` | Capture as-is. |
| `after-copy` | Reads correctly but carries unresolved copy (payment order, launch offer, example-code framing). |
| `after-data` | Correct, but marketplace density is seeded during Node 0 rehearsal. |
| `internal-only` | Shows money owed, lead contact details, or ops tooling. Never public. |

Every label except `safe-now` carries a `captureReadinessReason`. Four frames are
`safe-now` today: 13f verify-phone, 10a redeem, 12a landing, 12e pricing (its copy became
governed when the launch offer was withdrawn). Both founder and all admin
frames are `internal-only` by schema rule, so no ops surface can leak into marketing.

## Prototype coverage

18 of 22 frames are `clickable` and name a `prototypeRef`. Four are not, each with a
written reason (schema rule 2 requires one):

| Frame | Status | Why |
|---|---|---|
| M8 Create deal | `current-not-clickable` | Not in the phone prototype. The earlier reason — "the repo create flow has no charge-disclosure step" — was **factually wrong**: the step ships and is unskippable. |
| 11e Support | `current-not-clickable` | Desktop ops surface, intentionally outside the phone prototype. |
| 12d For merchants | `current-not-clickable` | Public marketing page; no `prototypeRef` confirmed. Row added repo-side — see `landedInRepo`. |
| 12e Pricing | `current-not-clickable` | Not built in the phone prototype. The earlier reason — unresolved launch-offer copy — no longer applies: the offer was withdrawn 2026-07-29. |

Founder and guardian surfaces are desktop in production and are rendered compact in the
phone prototype. That is a deliberate compromise, noted rather than hidden.

## Still route-only, and why

| Frame | Reason |
|---|---|
| 13g Browse | Map surface; anchor depends on seeded geo data. |
| 8l My deals | Covered transitively by 8j; low marginal value. |
| 13i Top-up | Payment provider order unresolved (D-06) — an anchor now would lock in the wrong primary method. |
| 13k Alerts | Alert copy still moving. |
| M8 Create deal | `design-ahead`; schema forbids smoke on unshipped behaviour (D-03). |
| 11e Support | Desktop ops surface, outside the phone prototype. |
| 12e Pricing | Launch-offer copy unresolved. |

## Open blockers

- **D-07 verify-anyway (product decision).** `claim-and-till/README.md` documents that a
  location mismatch still redeems and the dispute routes to admin review. The frames and
  prototype show wrong-shop as a hard rejection with no fee. One is wrong. Resolve before
  anyone builds the reject path — a smoke test written against the wrong branch would
  cement the error.
- **D-06 payment order (code).** Design system says M-Pesa is always primary; shipped runs
  Stripe Phase 1 pending IntaSend credentials.
- **D-08 provenance.** This mirror lives in Claude Design, not the repo. Until the folder
  is committed and CI runs Layer 1, "the repo validates the contract" is aspiration.
