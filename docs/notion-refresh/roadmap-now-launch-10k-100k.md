# Roadmap: Now / Launch / 10k / 100k

**Status:** Canonical · **Last verified:** 2026-07-28  
**Supersedes:** 12-Week Build Schedule and 12-Week Operational Plan as living roadmaps (archive those)  
**Repo:** `docs/system-design-pre10k.md`, `docs/ops/tech-stack-deep-dive-2026-07.md`, `docs/skills/tech-stack-100k.md`

## Purpose

Scale roadmap tied to **operating reality**, not a fictional week counter.

## Now (pre-launch / rehearsal)

**Goal:** Reliable Node 0 loop on production with honest inventory.

- Finish human prod apply (migrations, seed policy, auth strategy documented).
- 2-phone golden path sign-off.
- Agent rota rehearsed; dispute path staffed at founder/admin level.
- Waitlist capture verified; campaign only when M1–M7 ready.
- Keep Stripe sandbox; keep IntaSend prepared without assuming availability.

**Stack stance:** Next.js single region + Supabase single project is adequate.

## Launch (BBS Mall open shoppers)

**Goal:** Real merchants, real redemptions, fee collection working.

- At least one live top-up rail merchants can use (card live and/or M-Pesa).
- Legal publish path resolved or explicitly constrained launch with counsel.
- Guardian thresholds monitored in PostHog; adjust via config only.
- Support SLA: 72h disputes; WhatsApp ops hours published internally.
- No multi-mall promise in marketing.

## ~10,000 users

**Goal:** Same architecture, tighter ops and caching discipline.

Adequate without multi-region if:

- Feed cache + RPC money path remain hot-path healthy.
- Observability actually used (error budget, redemption funnel).
- Notification prefs may need server persistence (today partly local).
- Still Node-dense strategy; expand malls deliberately.

See `docs/system-design-pre10k.md`.

## ~100,000 users

**Goal:** Decide keep-vs-change with evidence.

Likely pressure points (from deep dive skill):

- Read scaling for public browse (edge cache / replicas).
- Auth SMS cost and deliverability (Clerk).
- Stronger segmentation analytics and cohort retention in PostHog.
- Possible dedicated founder vs admin permission split.
- Mall-operator reporting product (still not Oracle).
- Multi-node reporting beyond Node 0 summaries.

Do **not** pre-build Oracle. Revisit data pathway only with partner demand + governance.

## Explicit non-goals until justified

- Native apps
- In-app shopper payments
- Star ratings / social graph
- Multi-city spray expansion
- Analytics/Oracle as a sold product

## Risks

- 12-week Notion schedules resurrect as “we’re late on week 9” noise.
- Scaling fantasy before Node 0 fee economics proven.

## Dependencies

- Launch Readiness gates.
- Capital/time for SMS and support.
- Partner appetite before data-product work.

## Next actions

1. Archive 12-week pages with pointers here.
2. Review this page monthly against tracker blockers.
3. Keep tech deep dive updated when stack choices change.

## Related pages

- Launch Readiness
- Current State of MAANTA
- Strategic Partnerships and Data Pathway
- Architecture
- Investor Readiness
