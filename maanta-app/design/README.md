# MAANTA design artifacts

| Folder / file | What it is | Authority |
|---|---|---|
| `current-reality/` | **Canonical current-state truth** — which screens exist, at which route, for which role, under which runtime rules. `frames.json` is the machine-checked source; `index.html` renders it. | **Canonical.** Wins over any doc for current-state questions. Repo wins for *how* behaviour works. |
| `claim-and-till/` | Interactive wireframe canvas for the claim + till moments. Repo-side mirror of a Claude Design `.dc.html`. | Design intent for those frames. Not a current-state inventory. |
| `Maanta_Wireframe_System.pdf` | The frame-ID system (`8g`, `9k`, `10q`, …) the other artifacts reference. | Reference. Historical numbering, still used for IDs. |

Rules for using and updating these: **`docs/design-truth-protocol.md`**.
PR checklist: **`docs/skills/design-sync-checklist.md`**.

## Quick answers

- *"Does screen X exist today?"* → `current-reality/frames.json`.
- *"What is screen X supposed to look like?"* → `claim-and-till/` (if covered),
  else `docs/skills/frozen-ui-overall-handoff.md`.
- *"Why does it behave that way?"* → `docs/maanta-decisions-log.md`.
- *"Is this safe to build?"* → only if it is a `current` frame the code doesn't
  yet match. `design-ahead` needs a decision first.

## Provenance warning

`current-reality/` is a **reconstructed mirror**, not an imported canvas — the
original `Maanta Current Reality.dc.html` was not reachable when it was built.
That is stated in its README and enforced by the provenance test. Do not cite it
as "the audit".
