# What Is Real vs Staged vs Planned

<!-- Paste format: bullet lines, not tables — the live Notion pages store rows
     as `- **Col:** value · **Col:** value`, and table pastes mangle. See
     docs/notion-refresh/README.md § "Paste format". Do not convert back. -->

**Status:** Canonical diligence page · **Last verified:** 2026-07-28  
**Audience:** founder, investor, advisor, partner, engineer

## Purpose

Prevent false confidence. Every MAANTA claim should fit one label below.

## Labels

- **Label:** **Working now** · **Meaning:** Observable in production *or* repeatedly proven in CI against real schema, and intentionally relied on
- **Label:** **Implemented, unverified in production** · **Meaning:** In repo / CI / local Supabase; not yet proven on live Vercel+Supabase with real devices
- **Label:** **Staged / seeded** · **Meaning:** Demo data, rehearsal personas, synthetic nodes — useful for demos, not organic traction
- **Label:** **Manual / ops-assisted** · **Meaning:** Requires human dashboard work, field agents, or founder judgment
- **Label:** **Planned** · **Meaning:** Intended for launch or near-term roadmap; not shipped
- **Label:** **Future strategic path** · **Meaning:** Directional; must not be described as product capability today

## Matrix

- **Capability:** Browse live deals by node · **Label:** Implemented, unverified **or** Staged · **Notes:** Depends whether prod seed/real merchants applied; empty feed ≠ broken product
- **Capability:** Claim deal → OTP ticket · **Label:** Implemented, unverified in prod (device gate) · **Notes:** CI SQL golden path ✅; 2-phone BBS pass still owed
- **Capability:** Merchant verify OTP · **Label:** Implemented, unverified in prod · **Notes:** Same
- **Capability:** KES 30 fee / arrears accounting · **Label:** Working in repo/CI · **Notes:** Ledger via RPCs; prod money movement needs live top-up rails
- **Capability:** Verify-anyway (fee unknown) · **Label:** Working in repo/CI · **Notes:** Fraud task opened
- **Capability:** Guardian clear/flag/soft/hard · **Label:** Working in repo/CI · **Notes:** Tunable via `app_config`; prod threshold ops still manual
- **Capability:** Admin fee reversal · **Label:** Working in repo/CI · **Notes:** Note required
- **Capability:** Stripe top-up · **Label:** Implemented (sandbox) · **Notes:** Live keys pending
- **Capability:** M-Pesa STK (IntaSend) · **Label:** Planned / blocked externally · **Notes:** Code path exists; credentials not assumed
- **Capability:** Waitlist → Resend · **Label:** Partially working · **Notes:** Proxy built; keep verifying prod signups
- **Capability:** Clerk phone OTP claim gate · **Label:** Planned for launch / partial · **Notes:** Required for claim when strategy=`clerk`
- **Capability:** Supabase email OTP rehearsal · **Label:** Working when strategy=`supabase` · **Notes:** Prod email auth fixes shipped 2026-07-28; dashboard URL/template config manual
- **Capability:** `/app-bootstrap` role routing · **Label:** Working in repo · **Notes:** Strategy-aware
- **Capability:** `/founder` KPI dashboard · **Label:** Implemented · **Notes:** Admin-role gated; not a separate founder DB role
- **Capability:** 100 BBS deals seed · **Label:** Staged / seeded · **Notes:** Local validated; prod apply human-owned
- **Capability:** Nairobi 150 (3 nodes) · **Label:** Staged / seeded · **Notes:** CBD Galleria + Westlands = synthetic rehearsal
- **Capability:** Multi-mall live expansion · **Label:** Planned · **Notes:** After Node 0 PMF
- **Capability:** Mall-operator analytics dashboard · **Label:** Planned / deferred · **Notes:** Frozen UI deferred item
- **Capability:** Oracle-style data product · **Label:** Future strategic path · **Notes:** Explicitly **not** present fact
- **Capability:** Published legal policies · **Label:** Planned · **Notes:** Drafts in repo; lawyer review blocked on incorporation
- **Capability:** Agency waitlist campaign · **Label:** Planned / not fully live · **Notes:** Brief + sequences exist

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
