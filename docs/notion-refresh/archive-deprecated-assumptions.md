# Archive / Deprecated Assumptions

**Status:** Canonical index · **Last verified:** 2026-07-28  
**Audience:** anyone editing Notion

## Purpose

Landing zone for retired claims. **Do not delete history** — mark deprecated and point to the canonical page.

## Deprecated assumptions (do not reuse in active pages)

| Old claim | Why wrong now | Canonical replacement |
|---|---|---|
| Auth is exclusively Clerk / Twilio Verify | Dual strategy (`supabase` rehearsal, `clerk` launch); Twilio Verify decommissioned | Auth and Identity |
| Core loop lives in Supabase Edge Functions | Money path is Postgres RPCs + Next route handlers | Claims/Fees + Architecture |
| Schema Reference v3 (2026-06-29) is live schema | Dozens of migrations since | Repo `supabase/migrations` |
| “No Swahili / multi-language forever” as product law | `preferred_language` exists; SW UI “coming soon” — still not full i18n | Product Flows / Overview |
| Parallel launch-audit branches (#69 / hn5qne) are active | PR #70 merged; branches retired | Launch Readiness / Build OS history note |
| Abandoned Supabase project `vcrfqsevompqjazbwzyh` is prod | Live project is `axrrslqssmbngbataejg` | Launch Readiness |
| Waitlist lives in Supabase tables | Resend is system of record; stateless proxy only | Waitlist & Email page |
| IntaSend is the live Kenya payment fact | Prepared, not assumed | Payments sections / Launch Readiness |
| Guardian velocity/geofence/collusion “proposed only” | Guardian v1 implemented 2026-07-21+ | Claims, Redemption, Fees, and Guardian |
| Top-ups credit balance without settling arrears | Settles arrears first (2026-07-21) | Claims/Fees |
| Analytics/Oracle is a current product | Future strategic path only | Strategic Partnerships and Data Pathway |
| Multi-node Nairobi seeds = live expansion | Synthetic rehearsal nodes | BBS Mall / Nairobi Rollout |
| Repo CI green = prod hardened | Explicitly false per launch audit | Observability + Launch Readiness |
| Shopper pays MAANTA digitally for deals | Cash to merchant off-app | Overview / Product Flows |

## Pages to archive (process)

Move under this Archive section (or add banner at top):

1. Product Brief → banner: superseded by **MAANTA Overview**
2. User Flows → superseded by **Product Flows**
3. 12-Week Build Schedule → superseded by **Roadmap**
4. 12-Week Operational Plan → superseded by **Roadmap** + **Launch Readiness**
5. WALKTHROUGH.md Notion copy → Node 0 Rehearsal Checklist
6. CLAUDE.md Notion copy → repo `CLAUDE.md` wins
7. API Actions & Edge Functions → stub pointing to repo RPCs
8. Schema Reference → banner: historical snapshot only

## How to archive safely

1. Add a callout at the top: `DEPRECATED as of YYYY-MM-DD — see [[canonical]]`.
2. Move page under Archive in the sidebar (Notion move), or leave in place with banner if move breaks links.
3. Do **not** erase Decisions Log entries — they are history.
4. Update Build OS hub links to point at canonical pages.

## Related pages

- notion-page-map (repo: `docs/notion-refresh/notion-page-map.md`)
- Risks and Hard Truths
- Decisions Log
