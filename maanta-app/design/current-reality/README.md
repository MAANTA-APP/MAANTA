# Current Reality — canonical current-state design truth

**This folder is the canonical in-repo home for what MAANTA's product actually
is today.** When code and a design doc disagree about a current-state screen,
route, label or runtime rule, this folder wins — unless the code is provably a
newer verified behaviour, in which case update this folder in the same PR.

| File | Role |
|---|---|
| `frames.json` | **Canonical.** Machine-readable frame inventory: id, title, route, role, status, runtime rules, notes. Diffable and CI-checked. |
| `index.html` | Human view of the same data. Self-contained, no build, no network. |
| `README.md` | This file — provenance and how to replace the mirror with the real export. |

**Coverage:** primary screens plus every surface carrying a role gate or a
runtime rule — not every leaf route. Redirect-only legacy routes (`/profile`,
`/deals`, `/notifications/preferences`) and the `/app-bootstrap` role router are
deliberately absent. Adding a new gated or rule-bearing route means adding a
frame; the `coverage` field in `frames.json` says the same thing next to the data.

Protocol (truth order, labels, what to update when): **`docs/design-truth-protocol.md`**.

## Provenance — read before citing this

This is a **repo-native mirror**, honestly labelled as such.

The named source artifact, **`Maanta Current Reality.dc.html`**, is a Claude
Design canvas — the same kind of file as the one behind
`maanta-app/design/claim-and-till/`. It was **not reachable** from the session
that created this folder: not in the repo, not in Notion, not in Google Drive,
not in Canva. No content here is copied from it.

Every row in `frames.json` was re-derived from sources that *are* checked in or
directly verifiable:

- `docs/notion-refresh/what-is-real-vs-staged-vs-planned.md`
- `docs/notion-refresh/product-flows.md`
- `docs/skills/ui-walkthrough-roles.md`
- the repo's own routes, role guards and migrations, verified directly

**Do not describe this file as "the audit" or cite it as if it were the canvas.**
It is a reconstruction that agrees with the repo as of `lastVerified`.

## Importing the real artifact later

The structure is designed so the export drops in without rethinking anything:

1. Export the canvas and commit it here as
   `Maanta Current Reality.dc.html` (keep the original filename — that is the
   provenance), alongside any assets it needs.
2. Reconcile `frames.json` against it, row by row. Where they disagree, the
   canvas wins for design intent and the repo wins for shipped behaviour —
   record the resolution in `docs/maanta-decisions-log.md` if it changes a rule.
3. Update `provenance.kind` to `"imported"`, drop `awaitingSourceImport`, and
   bump `lastVerified`.
4. Leave `frames.json` canonical for machine checks. The `.dc.html` is the
   visual authority; the JSON is what CI can enforce.

`index.html` stays useful either way — it renders `frames.json`, not the canvas.

## What CI enforces

`maanta-app/src/lib/__tests__/design-truth.test.ts` runs with `npm test` and
fails when:

- a `current` frame's `route` no longer resolves to a page in `src/app`
  (catches a renamed or deleted route before it silently becomes drift),
- a frame cites a `rules` key that isn't defined in `runtimeRules`,
- a `superseded` frame points at a `supersededBy` id that doesn't exist,
- a `design-ahead` frame has acquired a route (i.e. someone built it without
  moving it to `current`),
- ids are not unique, or a status isn't one of the four defined labels.

It also checks the **behavioural contract** carried by frames with a `smoke`
block: that the block is well formed (exactly one of `heading` /
`redirectTarget`, a role the E2E helpers can drive), that a declared heading
really exists in that route's source, and that a declared redirect matches the
page's actual `redirect()` call. So renaming a heading fails CI immediately,
without a browser.

`npm run test:e2e` then executes the same contract for real:
`e2e/design-truth-smoke.spec.ts` generates one test per contracted frame —
the intended role lands on the route, the anchor is visible, denied roles are
bounced, redirects arrive. It needs a live env and skips per frame when a role
storage state isn't provisioned.

Neither layer proves a screen *looks* right — that stays a human review, which
is what `docs/skills/design-sync-checklist.md` is for. See
`docs/design-truth-protocol.md` §4 for when a frame needs a `smoke` block.

## Opening the human view

```bash
# canonical data — just read it
cat maanta-app/design/current-reality/frames.json

# rendered view (fetch is blocked on file://, so serve the folder)
cd maanta-app/design/current-reality && python3 -m http.server 8000
```

## Related

- `maanta-app/design/claim-and-till/` — interactive wireframe canvas for the
  claim + till moments (mirrors its own `.dc.html`).
- `maanta-app/design/Maanta_Wireframe_System.pdf` — the frame-ID system.
- `docs/skills/frozen-ui-overall-handoff.md` — how the frozen UI maps to code.
