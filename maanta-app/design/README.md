# MAANTA design artifacts

| Folder / file | What it is | Authority |
|---|---|---|
| `current-reality/` | **The contract** — 21 audited frames with route, role, status, job, primary action, runtime rule and state coverage. `frames.json` + `frames.schema.json`, CI-checked by `src/lib/design-truth/`. | **Canonical** for *what exists*. The repo wins for *how it behaves*; Notion wins for product intent. |
| `claim-and-till/` | Interactive wireframe canvas for the claim + till moments. Repo-side mirror of a Claude Design `.dc.html`. | Design intent for those frames. Not a current-state inventory. |
| `Maanta_Wireframe_System.pdf` | The frame-ID system (`8g`, `9k`, `10q`, …) the other artifacts reference. | Reference. Historical numbering, still used for IDs. |

Rules for using and updating these: **`docs/design-truth-protocol.md`**.
PR checklist: **`docs/skills/design-sync-checklist.md`**.

## Quick answers

- *"Does screen X exist today?"* → `current-reality/frames.json`.
- *"Which states of X are unbuilt?"* → that frame's `stateCoverage.missing`.
- *"What is screen X supposed to look like?"* → `claim-and-till/` (if covered),
  else `docs/skills/frozen-ui-overall-handoff.md`.
- *"Why does it behave that way?"* → `docs/maanta-decisions-log.md`.
- *"Is this safe to build?"* → only if it is a `live` or `gated` frame the code
  doesn't yet match. `design-ahead` needs a decision first.

## Provenance warning

`current-reality/` was **authored in Claude Design, not extracted from the repo**
(mirror of `Maanta Current Reality.dc.html`). Its verification against `main` is
manual and dated, so it will rot — that is what Layer 1 exists to catch. The
schema forbids the mirror from describing itself as repo-derived. There is **no
`index.html`**: the human-readable view is the `.dc.html` in the Claude Design
project.
