# Plugin / skill install verification — 2026-08-01

Session: VC-startup uplift + pilot planning. Verified on macOS darwin 24.5.0.

## Cursor skills (`~/.cursor/skills/`)

| Skill dir | Status | Notes |
|---|---|---|
| `caveman/` | ✅ pass | Core terse-response skill |
| `caveman-commit/` | ✅ pass | Commit message helper |
| `caveman-compress/` | ✅ pass | Response compression |
| `caveman-help/` | ✅ pass | Caveman mode help |
| `caveman-review/` | ✅ pass | Code review style |
| `caveman-stats/` | ✅ pass | Stats formatting |

**Result:** 6/6 caveman* directories present. All installed 2026-08-01 02:40 local.

## Claude Code plugins

Binary: `~/Library/Application Support/Claude/claude-code/2.1.219/claude.app/Contents/MacOS/claude`

Command: `claude plugin list`

| Plugin | Version | Scope | Status |
|---|---|---|---|
| `context7@context7-marketplace` | 1.0.2 | user | ✅ enabled |
| `impeccable@impeccable` | 4.0.4 | user | ✅ enabled |
| `nextlevelbuilder-ui-ux-pro-max-skill-2@cascade-content-creation-misc-1` | 2.11.0 | user | ✅ enabled |
| `superpowers@claude-plugins-official` | 6.2.0 | user | ✅ enabled |

**Result:** 4/4 plugins installed and enabled.

## Cursor subagent limitations

This session ran in **Cursor Agent**, not Claude Code CLI. Therefore:

- `/impeccable init|polish|audit` — **not invokable**; patterns applied manually in code
- UI/UX Pro Max skill — **not loaded via slash**; VC-startup standards applied directly
- `superpowers` workflow — **not invokable**; phased deliverables followed manually
- `context7` live docs — **not invoked**; repo docs + MCP used instead

## Pass/fail summary

| Check | Result |
|---|---|
| Caveman skills on disk | ✅ PASS |
| Claude Code plugins listed | ✅ PASS |
| Plugins usable from Cursor subagent | ⚠️ PARTIAL — manual pattern application only |
| Repo marketing guard tests | ✅ PASS — 18/18 (marketing-shell, pricing-copy, held-claims) |
| Production build + check-tokens | ✅ PASS — 47 files scanned, no {{TOKEN}} |

## Recommended follow-up

1. Run `/impeccable audit` in Claude Code on `(marketing)/` after this session's diff lands.
2. Use UI/UX Pro Max palette/typography export to validate hero contrast ratios.
3. Keep this file updated if plugin versions change before BBS launch.
