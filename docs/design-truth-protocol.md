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

## 4. Behavioural smoke coverage

Two layers protect a frame. Route/rule metadata is checked for **every** frame;
executable behaviour is checked only for frames carrying a `smoke` block.

**A frame needs `smoke` when any of these is true:**

- it is a **role entry screen** — the first thing a role lands on (`/feed`,
  `/merchant/redeem`, `/agent`, `/admin`, `/founder`);
- it is a **redirect** whose destination is part of the contract (`/profile` →
  `/you`);
- **reaching it is itself the guarantee** — a guard, gate or permission decides
  whether the user gets there;
- it is on the **money path** entry (`/merchant/wallet`, `/merchant/topup`).

**A frame stays route-only when:** it is a leaf reachable only from a covered
parent, it needs seeded dynamic data (`/deals/[id]`, `/tickets/[id]` — depth for
those lives in `golden-path.spec.ts`), or it is `design-ahead`/`superseded`.

**How to add it.** In `frames.json`, on the frame:

```json
"smoke": {
  "role": "owner",              // a role in e2e/helpers/roles.ts
  "heading": "Redeem a code",   // exact text of an h1 on the page
  "denyRoles": ["shopper"]      // optional: must be bounced away
}
```

Redirect frames use `"redirectTarget": "/you"` **instead of** `heading` — the
two are mutually exclusive and CI enforces that.

No test file needs editing: `e2e/design-truth-smoke.spec.ts` generates a test
per contracted frame.

**If the page has no stable anchor**, add one — in this order of preference:
a visible `<h1>` if the design already shows a title; otherwise a
`<h1 className="sr-only">`, which gives the page a real document outline for
screen readers and costs nothing visually. Do **not** add `data-testid` for
this; the smoke suite asserts by ARIA role so the anchor has to be a real
heading.

**Keeping the two layers in sync.** `design-truth.test.ts` runs in `npm test`
(no browser) and asserts the contract is coherent *and* that each declared
heading actually exists in that route's source, following one level of `@/`
imports. So renaming a heading fails CI immediately, long before the browser
suite runs — which matters, because the browser suite only runs once an
operator has provisioned `E2E_BASE_URL` and the role storage states.

## 5. Evidence rule (avoid receipt-style drift claims)

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

## 6. Where things live

| Path | What |
|---|---|
| `maanta-app/design/current-reality/` | **Canonical** current-state truth (`frames.json` + human view). |
| `maanta-app/design/claim-and-till/` | Interactive wireframe canvas — claim + till moments. |
| `maanta-app/design/Maanta_Wireframe_System.pdf` | Frame-ID system (`8g`, `9k`, …). |
| `docs/notion-refresh/` | Mirrors of approved Notion operating pages. |
| `docs/skills/` | Durable handoffs and dated audits. Historical unless marked current. |
| `docs/skills/design-sync-checklist.md` | The review checklist for a design-sync PR. |

## 7. CI

**`npm test`** runs `src/lib/__tests__/design-truth.test.ts` — no browser, so it
gates every PR. It fails when a `current` frame's route no longer exists, a
frame cites an undefined runtime rule, a `superseded` frame points nowhere, a
`design-ahead` frame acquires a route, ids collide, a `smoke` block is malformed
(both/neither of heading+redirectTarget, an unknown role, a denied role that is
also the driving role), a declared heading is missing from the route's source, a
declared redirect doesn't match the page's `redirect()` call, or provenance
claims an import that hasn't happened.

**`npm run test:e2e`** runs `e2e/design-truth-smoke.spec.ts`, generated from the
same `smoke` blocks: the intended role lands on the frame, the anchor is
visible, denied roles are bounced, redirects arrive. It needs `E2E_BASE_URL` and
role storage states, and skips per frame when a role isn't provisioned — honest
partial coverage, never a false green.

Neither layer checks pixels. Visual parity stays a human review.
