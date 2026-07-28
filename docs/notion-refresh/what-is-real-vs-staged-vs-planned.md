# What Is Real vs Staged vs Planned

**Status:** Canonical diligence page · **Last verified:** 2026-07-28  
**Audience:** founder, investor, advisor, partner, engineer

## Purpose

Prevent false confidence. Every MAANTA claim should fit one label below.

## Labels

| Label | Meaning |
|---|---|
| **Working now** | Observable in production *or* repeatedly proven in CI against real schema, and intentionally relied on |
| **Implemented, unverified in production** | In repo / CI / local Supabase; not yet proven on live Vercel+Supabase with real devices |
| **Staged / seeded** | Demo data, rehearsal personas, synthetic nodes — useful for demos, not organic traction |
| **Manual / ops-assisted** | Requires human dashboard work, field agents, or founder judgment |
| **Planned** | Intended for launch or near-term roadmap; not shipped |
| **Future strategic path** | Directional; must not be described as product capability today |

## Matrix

| Capability | Label | Notes |
|---|---|---|
| Browse live deals by node | Implemented, unverified **or** Staged | Depends whether prod seed/real merchants applied; empty feed ≠ broken product |
| Claim deal → OTP ticket | Implemented, unverified in prod (device gate) | CI SQL golden path ✅; 2-phone BBS pass still owed |
| Merchant verify OTP | Implemented, unverified in prod | Same |
| KES 30 fee / arrears accounting | Working in repo/CI | Ledger via RPCs; prod money movement needs live top-up rails |
| Verify-anyway (fee unknown) | Working in repo/CI | Fraud task opened |
| Guardian clear/flag/soft/hard | Working in repo/CI | Tunable via `app_config`; prod threshold ops still manual |
| Admin fee reversal | Working in repo/CI | Note required |
| Stripe top-up | Implemented (sandbox) | Live keys pending |
| M-Pesa STK (IntaSend) | Planned / blocked externally | Code path exists; credentials not assumed |
| Waitlist → Resend | Partially working | Proxy built; keep verifying prod signups |
| Clerk phone OTP claim gate | Planned for launch / partial | Required for claim when strategy=`clerk` |
| Supabase email OTP rehearsal | Working when strategy=`supabase` | Prod email auth fixes shipped 2026-07-28; dashboard URL/template config manual |
| `/app-bootstrap` role routing | Working in repo | Strategy-aware |
| `/founder` KPI dashboard | Implemented | Admin-role gated; not a separate founder DB role |
| 100 BBS deals seed | Staged / seeded | Local validated; prod apply human-owned |
| Nairobi 150 (3 nodes) | Staged / seeded | CBD Galleria + Westlands = synthetic rehearsal |
| Multi-mall live expansion | Planned | After Node 0 PMF |
| Mall-operator analytics dashboard | Planned / deferred | Frozen UI deferred item |
| Oracle-style data product | Future strategic path | Explicitly **not** present fact |
| Published legal policies | Planned | Drafts in repo; lawyer review blocked on incorporation |
| Agency waitlist campaign | Planned / not fully live | Brief + sequences exist |

## Demo hygiene rules

1. Before any external demo, state whether the feed is **seeded** or **real merchants**.
2. Never imply shoppers pay MAANTA in-app — they pay the merchant in cash after verification.
3. Never imply IntaSend is live.
4. Never imply Oracle / mall data APIs exist.
5. Separate “CI green” from “we completed a live redemption on two phones at BBS.”

## What is working

- Honest labeling is possible because money path and Guardian are well-tested in SQL.
- Seed scripts are idempotent and documented.

## What is not yet ready

- A single automated “prod truth” dashboard that proves seed vs live inventory (today: SQL counts + healthz + human checklist).

## Risks

- Older Notion pages (Product Brief, Architecture status lines, Rehearsal checklist) still mix labels.
- Parallel historical Build OS changelog entries can resurrect retired branch confusion (PR #69 vs #70) — treat as history.

## Dependencies

- Operators updating Launch Readiness after each prod apply.
- Founders refusing to oversell in decks.

## Next actions

1. Use this page as the first link in investor / partner packets.
2. After each prod apply, tick the matrix rows that move from “unverified” → “working now.”
3. Archive contradictory claims under **Archive / Deprecated Assumptions**.

## Related pages

- Current State of MAANTA
- Launch Readiness
- Investor Readiness
- Strategic Partnerships and Data Pathway
- Risks and Hard Truths
