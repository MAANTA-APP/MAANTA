# Skill — Supabase MCP + agent skills (repo pin)

**Status:** repo-configured 2026-07-26.  
**Project-ref:** `axrrslqssmbngbataejg` (production).

## MCP client

Pinned in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp?project_ref=axrrslqssmbngbataejg&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
    }
  }
}
```

**Auth required:** Cursor must complete the Supabase OAuth prompt (MCP server
shows `needsAuth` until you approve in the desktop IDE). Cloud agents cannot
finish that interactive step for you.

After auth, prefer MCP for SQL / schema / logs on this project instead of
guessing env or pasting shell into the SQL editor.

## Agent skills

Installed via `npx skills add supabase/agent-skills` (lockfile: `skills-lock.json`):

| Skill | Path |
|---|---|
| `supabase` | `.agents/skills/supabase/` |
| `supabase-postgres-best-practices` | `.agents/skills/supabase-postgres-best-practices/` |

Re-install / refresh: `npx skills add supabase/agent-skills --skill '*' -a cursor -y`
