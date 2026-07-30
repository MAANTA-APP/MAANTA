# Design sync checklist (procedure)

This is a **sync procedure**, not runtime truth. Runtime truth is:

1. Notion / product decisions  
2. Repo implementation (Next.js + SQL)  
3. `maanta-app/design/current-reality/` (`frames.json`)

## Before claiming a screen is “synced”

1. Open the route in `frames.json` — note `status`.
2. Open the frontend file(s) listed.
3. Trace the primary action to API/server action/SQL.
4. Confirm important refusal states are surfaced (not silent success).
5. If the wireframe shows more than code, mark **design-ahead** — do not
   “fix” by inventing backend.
6. If code has state the UI hides, either surface it or document **backend leads**.

## After a parity pass

- Update `frames.json` classifications.
- Record drift in `docs/skills/parity-drift-register-*.md` (open buckets).
- Leave a narrative in `docs/skills/*parity*audit*.md`.
- Founder-facing note under `docs/ops/`.

## Latest pass

`docs/skills/backend-frontend-parity-audit-2026-07-30.md`
