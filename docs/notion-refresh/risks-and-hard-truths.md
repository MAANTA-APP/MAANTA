# Risks and Hard Truths

**Status:** Canonical · **Last verified:** 2026-07-28  
**Audience:** founder, advisors, serious partners/investors

## Purpose

Name the uncomfortable truths so Notion stays credible.

## Hard truths

1. **Ready in repo ≠ ready in production.** Migrations, seeds, dashboards, and device passes are human gates.
2. **Seeded marketplace ≠ traction.** 100 BBS deals / Nairobi 150 seeds are rehearsal tools.
3. **Auth is not “done” because Clerk was chosen.** Dual strategy exists; SMS cost/deliverability and dashboard wiring remain.
4. **M-Pesa is not live.** IntaSend is prepared and blocked on access; assuming it is a diligence failure.
5. **Shoppers do not pay MAANTA in-app.** Cash to merchant; fee is merchant-side.
6. **Oracle/data platform is not real.** Future path only.
7. **Legal is not launch-complete.** Drafts exist; lawyer review blocked on incorporation/DPA decisions.
8. **Single-mall concentration.** Node 0 is strategy and risk.
9. **Ops is founder-heavy.** 72h dispute SLA and agent rota only work if humans show up.
10. **Notion has drifted.** Multiple pages still describe older architecture (Edge Functions framing, Clerk-only, June schema snapshot, parallel PR #69/#70 confusion). This refresh exists to correct that.

## Risk register (short)

| Risk | Severity | Mitigation |
|---|---|---|
| Prod/schema drift | High | Migration runbook + healthz + Launch Readiness counts |
| Empty or misleading feed | High | Seed policy + node cookie discipline |
| Payment rail gap at launch | High | Explicit Stripe-live and/or IntaSend plan |
| Fraud / collusion | Medium | Guardian v1 + admin queues + threshold tuning |
| SMS / auth friction killing claims | High | Phone gate UX + rehearsal on supabase strategy; validate Clerk SMS before launch |
| Privacy/regulatory | High | Counsel; DPA basis for eu-west-1 |
| Overclaiming in fundraising | High | Real vs Staged page mandatory |
| Key-person burnout | Medium | Agent rota; narrow weekly objectives per Claude OS |

## What is working

- Written frozen rules reduce product thrash.
- Money-path tests make silent ledger bugs harder.

## What is not yet ready

- Formal risk owner beyond founder.
- On-call rotation for Sentry.

## Dependencies

- Honest status culture across Notion + repo.
- Weekly tracker review.

## Next actions

1. Review this page in weekly operator loop.
2. Convert any mitigated risk into a dated Decisions Log note.
3. Keep Archive page updated when old claims die.

## Related pages

- Current State of MAANTA
- What Is Real vs Staged vs Planned
- Launch Readiness
- Investor Readiness
- Open Questions
