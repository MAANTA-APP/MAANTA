# Design current reality (canonical inventory)

This folder is the **design-side current-reality** inventory for MAANTA.

It does **not** replace Notion product decisions or the shipped Next.js routes.
It classifies how each critical surface relates to code as of the parity audit
on 2026-07-30.

## Files

| File | Role |
|---|---|
| `frames.json` | Machine-readable surface inventory (route → classification + evidence) |
| `README.md` | This note |

## Classification vocabulary

| Status | Meaning |
|---|---|
| `live` | Shipped route + backend path; shoppers/operators can use it when env is configured |
| `gated` | Live only with auth/role/permission or feature gate |
| `rehearsal` | Works under Supabase auth / seed / demo posture; launch path differs |
| `design-ahead` | Wireframe or inventory shows more than code supports — do not treat as shipped |
| `blocked` | Code exists but needs env/keys/processor before it is real |
| `superseded` | Inventory/wireframe name no longer canonical; alias may redirect |

## Where the pixels live

| Artifact | Role |
|---|---|
| `../claim-and-till/` | Self-contained claim + till HTML canvas (repo-side wireframes) |
| `../Maanta_Wireframe_System.pdf` | Broader wireframe system PDF |
| External Claude Design `.dc.html` | Referenced from claim-and-till README — **not** vendored in-repo |

There is no pixel-fidelity checker in CI. Route guards and unit/SQL tests prove
behavior, not layout.

## Sync procedure

Human design sync checklist (procedure, not runtime truth):
`docs/skills/design-sync-prompt-2026-07-24.md` and related audit docs under
`docs/skills/*parity*`, `docs/skills/*truth*`, `docs/skills/*e2e*`.
