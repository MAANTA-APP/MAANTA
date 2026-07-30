# Investor Readiness

**Status:** Canonical · **Last verified:** 2026-07-28  
**Audience:** founder, advisors, prospective investors  
**Rule:** Prefer under-claiming. Link **What Is Real vs Staged vs Planned** in every packet.

## Purpose

Diligence posture: what is investable today, what is unfinished, what must never be implied.

## Current reality

MAANTA is a **pre-launch, Node 0** company with:

- A concrete commercial mechanic (KES 30 per verified in-person redemption).
- A built and CI-tested money path in Postgres.
- A single-mall GTM (BBS Mall) with field ops design.
- Production app scaffolding on Vercel/Supabase that still needs human verification gates.

It is **not** yet a live multi-mall network, a payments app for consumers, or a mall data platform.

## Credible narrative (safe)

1. Problem: merchants lack verified attribution for in-mall offers; shoppers lack trustworthy live deals.
2. Solution: claim → OTP → verify at counter → success fee.
3. Why BBS first: density, footfall, operable with a small agent team.
4. Why technical approach: enforce money invariants in the database; verify-anyway preserves shopper trust; Guardian adds conservative fraud holds.
5. Status: repo-ready for rehearsal; launch gated on prod apply, device proof, payment credentials, legal.

## Do not claim

- Live M-Pesa unless IntaSend is actually live.
- Organic GMV/redemptions derived from **seeded** deals.
- Oracle / exclusive mall data APIs.
- “Fully prod hardened” because CI is green.
- Multi-node Nairobi traction from synthetic seeds.

## Diligence folder (minimum)

| Artifact | Status |
|---|---|
| Overview + Real vs Staged | This refresh |
| Decisions / frozen rules | Decisions Log + Frozen Scope |
| Launch tracker | Launch Readiness |
| Architecture / stack | Architecture + tech deep dive (repo) |
| Security / money tests | CI SQL suites summary |
| Legal drafts | Repo `maanta-app/legal/` — drafts only |
| Cap table / equity note | Build OS founder note (75% / 15% reserved / 10% pool) — keep accurate |

## What is working for diligence

- Clear frozen unit economics story (KES 30).
- Auditable ledger design.
- Written operating system (Claude OS / Notion hierarchy).

## What is not yet ready

- Traction metrics from real redemptions at scale.
- Published policies.
- Payment rail finality for Kenya launch.

## Risks (disclose)

- Auth/SMS cost and deliverability.
- Concentration risk (single mall).
- Regulatory/privacy (eu-west-1 + Kenya DPA).
- Key-person ops load at launch.

## Dependencies

- Honest demo hygiene.
- Updated Launch Readiness the week of any raise conversation.

## Next actions

1. Attach Real vs Staged as page 2 of any deck appendix.
2. Prepare a 5-minute live demo script that labels seed data out loud.
3. Refresh legal timeline relative to Nairobi trip.

## Related pages

- MAANTA Overview
- What Is Real vs Staged vs Planned
- Risks and Hard Truths
- Roadmap
- Revenue & Business Model
