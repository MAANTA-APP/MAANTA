# Skill — Notion operating-truth refresh (2026-07-28)

**Status:** durable handoff · **Updated:** 2026-07-28  
**Deliverable root:** `docs/notion-refresh/`

## What happened

Full audit of MAANTA Notion (Build OS tree) against repo reality. Produced:

- Page inventory + actions: `notion-page-map.md`
- Proposed IA: `notion-information-architecture.md`
- 14 canonical page drafts (paste-ready)
- Manual apply checklist: `manual-update-checklist.md`
- Notion API: create **Operating Truth** hub + child pages when integration access allows (log in PR / session notes)

## Truth rules for future Notion edits

1. Label claims: working now / unverified in prod / staged / manual / planned / future path.
2. Auth is **dual strategy** — never write Clerk-only without checking `MAANTA_AUTH_STRATEGY`.
3. Repo migrations win over Schema Reference snapshots.
4. Oracle/analytics = future path only.
5. Archive banners > deletes.

## Canonical pages

1. MAANTA Overview  
2. Current State of MAANTA  
3. What Is Real vs Staged vs Planned  
4. Launch Readiness  
5. BBS Mall / Nairobi Rollout  
6. Product Flows  
7. Auth and Identity  
8. Claims, Redemption, Fees, and Guardian  
9. Observability and Production Verification  
10. Roadmap: Now / Launch / 10k / 100k  
11. Investor Readiness  
12. Strategic Partnerships and Data Pathway  
13. Risks and Hard Truths  
14. Archive / Deprecated Assumptions  

## When to update

After launch-audit class changes, auth strategy flips, prod apply events, or fundraising narrative work — update the matching canonical draft **and** Notion page, then bump “Last verified”.
