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

**All page bodies are converted** (2026-07-30 sweep) and each carries an inline note
not to "tidy" it back into tables:

- `archive-deprecated-assumptions.md`, `auth-and-identity.md`,
  `bbs-mall-nairobi-rollout.md`, `claims-redemption-fees-guardian.md`,
  `current-state-of-maanta.md`, `investor-readiness.md`, `launch-readiness.md`,
  `maanta-overview.md`, `observability-and-production-verification.md`,
  `risks-and-hard-truths.md`, `strategic-partnerships-and-data-pathway.md`,
  `what-is-real-vs-staged-vs-planned.md`
- `product-flows.md` and `roadmap-now-launch-10k-100k.md` had no tables to begin with.

**The working docs deliberately keep their tables** — they are never pasted into a
Notion page body, and tables read better in the repo: `notion-page-map.md`,
`notion-information-architecture.md`, `manual-update-checklist.md`,
`notion-api-change-log.md`, and this README.

**Also worth knowing:** the Notion MCP **write** path requires interactive approval,
so a non-interactive Claude session can read and diff these pages but cannot apply
them. Reads still catch drift — the 2026-07-30 sync found E11 and E16 stale on the
Notion side, independent of the changes being mirrored.
