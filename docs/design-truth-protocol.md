# Design truth protocol

How engineers decide what "current" means, and what to update when it changes.
Operational rules only — the reasoning lives in the docs this points at.

## 1. Truth order

When two sources disagree, the higher one wins:

1. **`maanta-app/design/current-reality/frames.json`** — canonical current-state
   screens, routes, roles and runtime rules.
2. **The repo** — code, migrations and guards, for *how the product actually
   behaves*. If the code is a newer verified behaviour than the artifact, the
   code wins **and you update the artifact in the same PR**.
3. **Notion** — operating source of truth for decisions and ops process
   (mirrored under `docs/notion-refresh/`).
4. **Everything else** — `docs/skills/*`, wireframe canvases, prototypes,
   historical audits. Provenance and intent, never implementation authority.

Rule of thumb: **artifact for *what*, code for *how*, Notion for *why*.**

## 2. Labels

Every frame in `frames.json` carries exactly one status.

| Status | Means | What you may do |
|---|---|---|
| `current` | Shipped, current-state. | Code must match. A mismatch is drift — fix it. |
| `design-ahead` | Designed, deliberately not built. | **Do not implement.** Needs a founder/PM decision first. Has no route. |
| `superseded` | Replaced by a `current` frame. | Never restore without a decisions-log entry. Names its replacement. |
| `historical` | Predates the frozen brief. | Provenance only. |

"Safe to build" = a `current` frame the repo does not yet match. Nothing else is
safe to build off an artifact alone.

## 3. What to update when

| You change… | Update |
|---|---|
| A route (add / rename / delete) | `frames.json` route for the affected frame. CI fails otherwise. |
| A user-visible label that names a product concept | `frames.json` notes, plus any `docs/skills/*` mirror that quotes the old label. |
| A runtime rule (fee, limit, gate, permission) | `frames.json` `runtimeRules` **and** `docs/maanta-decisions-log.md`. Frozen rules also need a founder ruling. |
| A staff permission → UI mapping | `src/lib/merchant-nav.ts` and `docs/skills/role-permissions.md`. |
| Shipping a `design-ahead` frame | Flip status to `current` and give it a route — CI enforces the pairing. |
| Retiring a screen | Set `superseded`, add `supersededBy`. Do not delete the row. |

Bump `lastVerified` whenever you touch `frames.json`.

## 4. Evidence rule (avoid receipt-style drift claims)

Do not record a drift item, or claim something is "audited", unless you can name
the evidence. Acceptable evidence:

- a file path + line in this repo,
- a migration or SQL test,
- a checked-in doc under `docs/`,
- a reproducible observation (route response, query result) stated as such.

Not acceptable: "the audit says", a link to an artifact that isn't in the repo,
or a recollection of a canvas nobody can open. **If an artifact is cited, it must
be checked in or the claim must be labelled as unverified.** Where a document is
reconstructed rather than imported, say so in its provenance block — see
`maanta-app/design/current-reality/README.md` for the pattern.

## 5. Where things live

| Path | What |
|---|---|
| `maanta-app/design/current-reality/` | **Canonical** current-state truth (`frames.json` + human view). |
| `maanta-app/design/claim-and-till/` | Interactive wireframe canvas — claim + till moments. |
| `maanta-app/design/Maanta_Wireframe_System.pdf` | Frame-ID system (`8g`, `9k`, …). |
| `docs/notion-refresh/` | Mirrors of approved Notion operating pages. |
| `docs/skills/` | Durable handoffs and dated audits. Historical unless marked current. |
| `docs/skills/design-sync-checklist.md` | The review checklist for a design-sync PR. |

## 6. CI

`npm test` runs `src/lib/__tests__/design-truth.test.ts`, which fails when a
`current` frame's route no longer exists, a frame cites an undefined runtime
rule, a `superseded` frame points nowhere, a `design-ahead` frame acquires a
route, ids collide, or provenance claims an import that hasn't happened.

It checks the map, not the pixels. Visual and behavioural parity stays a human
review.
