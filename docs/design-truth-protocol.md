# Design truth protocol

How engineers decide what "current" means, and what to update when it changes.
Operational rules only.

The contract itself, its schema, and its provenance live in
**`maanta-app/design/current-reality/`** — read that README before changing the
mirror. This file covers the repo side: truth order, what to update when, and
how the three validation layers fit together.

## 1. Truth order (fixed)

1. **Notion** — product and current state.
2. **The repo** — implementation. How the product actually behaves.
3. **The design system / mirror** — visual, and may describe an ideal ahead of
   what shipped.

A frame never overrules the first two. The order is asserted by
`mirror.truthOrder` in the contract and by Layer 1.

**When the mirror and the repo disagree about implementation, the repo wins and
the mirror is corrected in the same PR** — recorded under `landedInRepo.corrections`
with the evidence that settled it. When the mirror and the repo disagree about
*intent*, that is a question for the founder, not a licence to improvise.

## 2. Frame status

`status` ∈ `live` · `gated` · `blocked` · `rehearsal` · `design-ahead`.

| Status | Means | What you may do |
|---|---|---|
| `live` | Shipped current-state. | Code must match. A mismatch is drift — fix it. |
| `gated` | Shipped, reachable only behind a rule (phone gate, staff permission). | Build the gate state, not a bypass. |
| `blocked` | Shipped but blocked on something external. | Match shipped reality; do not fake the blocker away. |
| `rehearsal` | Real, but its data is seeded rehearsal. | Fine to build; never treat its numbers as traction. |
| `design-ahead` | Designed, **not shipped**. | **Do not implement.** Carries a `driftId` and cannot be smoke-tested. |

"Safe to build" = a `live` or `gated` frame the repo does not yet match.
Nothing else is safe to build from the mirror alone.

## 3. What to update when

| You change… | Update |
|---|---|
| A route (add / rename / delete) | the frame's `route`. Layer 1 fails otherwise. |
| A file a frame names | the frame's `sourceFiles`. Layer 1 fails otherwise. |
| A heading or anchor a frame promises | `expectedHeading` / `expectedAnchor`. Layer 1 fails otherwise. |
| A runtime rule (fee, grace, gate, permission) | `runtimeRules` **and** `docs/maanta-decisions-log.md`. Frozen rules also need a founder ruling. |
| Shipping a `design-ahead` frame | flip `status`, set `evidenceSource: repo`, close the drift row. |
| Retiring a screen | add a `superseded` row; do not delete the frame silently. |
| Adding a state to a screen | move it from `stateCoverage.missing` to `covered`. |

## 4. The three layers

| Layer | Where | Runs | Proves |
|---|---|---|---|
| 1 — static contract | `src/lib/design-truth/` | `npm run test:design-truth`, every PR | The mirror parses, and every rule / route / sourceFile / anchor it names actually exists. |
| 2 — behavioural smoke | `e2e/design-truth-smoke.spec.ts` | `npm run test:design-truth:smoke` | The intended role lands on the frame and sees the promised anchor. |
| 3 — process | package.json scripts | `npm run test:design-truth:all` | Both, in one command. |

Layer 1 is pure and needs nothing but the filesystem — that is why it, not the
browser suite, is the gate. Layer 2 needs a seeded non-prod environment.

**Layer 2 fails loudly.** A missing role account throws `missing test role: agent`.
It never passes by skipping, because a silently skipped contract test is
indistinguishable from a passing one in CI output.

### Adding smoke coverage to a frame

Set `smoke: true` and give it `requiredRole`, `authState`, and one of
`expectedHeading` / `expectedAnchor`. The schema rejects a smoke frame missing
any of those, and Layer 2 generates the test — **no test file is edited**.

If the screen has no user-facing anchor, add a real heading or `aria-label` to
the app. A visually hidden `<h1 className="sr-only">` is the right move when the
design intentionally shows no title; it also gives the page a document outline.
Do not add `data-testid` for this — Layer 2 asserts by ARIA role.

## 5. Evidence rule

Do not record a drift item, or call something "audited", unless you can name the
evidence: a file path + line, a migration or SQL test, a checked-in doc, or a
stated reproducible observation. **A citation to an artifact that is not checked
in is not evidence** — that was drift D-08, and it is why the mirror now lives in
the repo. Where a document is reconstructed rather than imported, say so in its
provenance block.

## 6. Where things live

| Path | What |
|---|---|
| `maanta-app/design/current-reality/` | **The contract** — `frames.json`, its schema, its provenance. |
| `maanta-app/design/claim-and-till/` | Interactive wireframe canvas — claim + till moments. |
| `maanta-app/design/Maanta_Wireframe_System.pdf` | Frame-ID system (`8g`, `9k`, …). |
| `src/lib/design-truth/` | Layer 1: Zod schema, loader, contract test. |
| `e2e/design-truth-smoke.spec.ts` | Layer 2, generated from the contract. |
| `docs/skills/design-sync-checklist.md` | PR checklist and reviewer prompts. |

## 7. Capture readiness

Every frame carries `captureReadiness`. Respect it before screenshotting
anything for marketing: `safe-now` · `after-copy` · `after-data` ·
`internal-only`. **Founder and admin frames are `internal-only` by schema rule** —
they show money owed, lead contact details, or ops tooling, and never appear in
public material.
