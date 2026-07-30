# Archive / Deprecated Assumptions

<!-- Paste format: bullet lines, not tables — the live Notion pages store rows
     as `- **Col:** value · **Col:** value`, and table pastes mangle. See
     docs/notion-refresh/README.md § "Paste format". Do not convert back. -->

**Status:** Canonical index · **Last verified:** 2026-07-28  
**Audience:** anyone editing Notion

## Purpose

Landing zone for retired claims. **Do not delete history** — mark deprecated and point to the canonical page.

## Deprecated assumptions (do not reuse in active pages)

- **Old claim:** Auth is exclusively Clerk / Twilio Verify · **Why wrong now:** Dual strategy (`supabase` rehearsal, `clerk` launch); Twilio Verify decommissioned · **Canonical replacement:** Auth and Identity
- **Old claim:** Core loop lives in Supabase Edge Functions · **Why wrong now:** Money path is Postgres RPCs + Next route handlers · **Canonical replacement:** Claims/Fees + Architecture
- **Old claim:** Schema Reference v3 (2026-06-29) is live schema · **Why wrong now:** Dozens of migrations since · **Canonical replacement:** Repo `supabase/migrations`
- **Old claim:** “No Swahili / multi-language forever” as product law · **Why wrong now:** `preferred_language` exists; SW UI “coming soon” — still not full i18n · **Canonical replacement:** Product Flows / Overview
- **Old claim:** Parallel launch-audit branches (#69 / hn5qne) are active · **Why wrong now:** PR #70 merged; branches retired · **Canonical replacement:** Launch Readiness / Build OS history note
- **Old claim:** Abandoned Supabase project `vcrfqsevompqjazbwzyh` is prod · **Why wrong now:** Live project is `axrrslqssmbngbataejg` · **Canonical replacement:** Launch Readiness
- **Old claim:** Waitlist lives in Supabase tables · **Why wrong now:** Resend is system of record; stateless proxy only · **Canonical replacement:** Waitlist & Email page
- **Old claim:** IntaSend is the live Kenya payment fact · **Why wrong now:** Prepared, not assumed · **Canonical replacement:** Payments sections / Launch Readiness
- **Old claim:** Guardian velocity/geofence/collusion “proposed only” · **Why wrong now:** Guardian v1 implemented 2026-07-21+ · **Canonical replacement:** Claims, Redemption, Fees, and Guardian
- **Old claim:** Top-ups credit balance without settling arrears · **Why wrong now:** Settles arrears first (2026-07-21) · **Canonical replacement:** Claims/Fees
- **Old claim:** Analytics/Oracle is a current product · **Why wrong now:** Future strategic path only · **Canonical replacement:** Strategic Partnerships and Data Pathway
- **Old claim:** Multi-node Nairobi seeds = live expansion · **Why wrong now:** Synthetic rehearsal nodes · **Canonical replacement:** BBS Mall / Nairobi Rollout
- **Old claim:** Repo CI green = prod hardened · **Why wrong now:** Explicitly false per launch audit · **Canonical replacement:** Observability + Launch Readiness
- **Old claim:** Shopper pays MAANTA digitally for deals · **Why wrong now:** Cash to merchant off-app · **Canonical replacement:** Overview / Product Flows

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
