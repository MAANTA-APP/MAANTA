# Notion refresh package

Paste-ready operating truth for MAANTA Notion (2026-07-28).

| File | Role |
|---|---|
| `notion-page-map.md` | Inventory of existing pages + actions |
| `notion-information-architecture.md` | Proposed sidebar structure |
| `manual-update-checklist.md` | Step-by-step apply guide |
| `maanta-overview.md` … `archive-deprecated-assumptions.md` | Canonical page bodies |
| `notion-api-change-log.md` | Log of API creates/updates (if any) |

Skill handoff: `docs/skills/notion-operating-truth-refresh-2026-07-28.md`.

## Paste format: bullets, not tables (2026-07-30)

A markdown-table paste of `launch-readiness.md` into its Notion page **silently did
not land** — the page body was unchanged afterwards, with its last-edited time
untouched. Two things to know before syncing any page here:

- **The live pages store these rows as bullets, not tables.** `notion-fetch` returns
  them as `- **#:** E11 · **Item:** … · **Status:** …`, which is the shape to write.
- **Multi-table markdown pastes are the fragile case.** The file that failed carried
  six tables across ~8.7k characters. Bullets paste reliably; if a whole-page paste
  still misbehaves, paste one `##` section at a time — section boundaries never split
  a row.

`launch-readiness.md` is converted and carries an inline note not to "tidy" it back
into tables. **The other page bodies in this directory still use tables** (see the
counts below) and are likely to hit the same problem on their next sync — convert
each one when you next touch it, rather than in a single sweep nobody can review:

| File | Table rows |
|---|---|
| `notion-page-map.md` | 62 |
| `current-state-of-maanta.md` | 32 |
| `what-is-real-vs-staged-vs-planned.md` | 31 |
| `notion-information-architecture.md` | 18 |
| `archive-deprecated-assumptions.md` | 16 |
| `maanta-overview.md` | 15 |
| others | ≤10 each |

(`notion-api-change-log.md` is a log, not a page body — it does not get pasted.)

**Also worth knowing:** the Notion MCP **write** path requires interactive approval,
so a non-interactive Claude session can read and diff these pages but cannot apply
them. Reads still catch drift — the 2026-07-30 sync found E11 and E16 stale on the
Notion side, independent of the changes being mirrored.
