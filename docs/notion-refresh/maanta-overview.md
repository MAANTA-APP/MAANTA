# MAANTA Overview

<!-- Paste format: bullet lines, not tables — the live Notion pages store rows
     as `- **Col:** value · **Col:** value`, and table pastes mangle. See
     docs/notion-refresh/README.md § "Paste format". Do not convert back. -->

**Status:** Canonical · **Last verified:** 2026-07-28 · **Audience:** everyone  
**Repo mirrors:** `docs/maanta-project-overview.md`, `CLAUDE.md`

## Purpose

One-page answer to: what MAANTA is, who it serves, how money works, and where we are launching — without mixing aspiration into present tense.

## Current reality

MAANTA is an **in-mall deals platform**. Merchants publish time-limited deals. Shoppers claim a deal in the app and get a 6-digit OTP ticket. At the counter, merchant staff verify the code. MAANTA then charges the merchant a **KES 30 success fee** from a prepaid wallet (or records **arrears** if the wallet cannot cover it). The shopper’s redemption still completes (**verify-anyway** for fee-unknown / low-balance paths; Guardian block-severity holds are the conservative exception and move no money).

**Node 0** is **BBS Mall, Eastleigh, Nairobi**. Density strategy: prove the loop in one mall before expanding.

**Tagline:** Discover, Claim and Redeem.

## What MAANTA is (and is not)

- **Is:** In-person claim → redeem with verified OTP · **Is not:** A delivery / logistics marketplace
- **Is:** Merchant-paid success fee + optional Elite subscription · **Is not:** An in-app shopper payment rail
- **Is:** Prepaid merchant wallet (Stripe sandbox today; M-Pesa STK prepared) · **Is not:** Instant settlement of shopper card payments
- **Is:** Multi-role PWA (shopper, merchant, agent, admin, founder dashboards) · **Is not:** Native iOS/Android apps (locked out of MVP)
- **Is:** Node-scoped feed (cookie `maanta_node`, default BBS Mall) · **Is not:** A multi-city live network today

## Actors and surfaces

- **Actor:** Shopper · **Surface:** `/feed`, `/browse`, deals, tickets · **Core job:** Browse → claim → show OTP → pay merchant **in cash off-app**
- **Actor:** Merchant · **Surface:** `/merchant/*` · **Core job:** Onboard → wallet → create deals → verify OTP
- **Actor:** Agent · **Surface:** `/agent/*` · **Core job:** Capture leads; attribution on merchant onboard
- **Actor:** Admin · **Surface:** `/admin/*` · **Core job:** Approve merchants, disputes, Guardian holds, fee reversal
- **Actor:** Founder · **Surface:** `/founder` · **Core job:** Executive KPIs (admin-role gated)
- **Actor:** Public · **Surface:** `/waitlist` · **Core job:** Segmented waitlist → Resend (stateless proxy)

## Commercial model (frozen)

- **KES 30** success fee per verified redemption, all plans — **not** under review.
- **Zero-balance gate:** merchants with no balance cannot create new deals; existing deals can still redeem into arrears.
- **Elite:** 30-day trial → 7-day grace → auto-downgrade to Standard. Paid Elite **KES 3,500/month** (price review Feb 2027).
- **Node 0 opening credit:** KES 300 to the first 100 activated launch merchants (promotional credit, not a fee waiver).
- **Boosts:** Elite-only, server-enforced.

## Technical posture (one line)

Next.js App Router PWA on Vercel + Supabase Postgres (RLS + money RPCs) + dual auth strategy (Clerk for launch; Supabase email OTP for rehearsal) + Resend waitlist + Stripe sandbox / IntaSend prepared.

## Truth labels (read before any diligence call)

- **Working in repo / CI:** claim → verify → fee/arrears money path, Guardian v1, admin fee reversal, frozen UI rules tests.
- **Staged / seeded:** demo deals and merchants (Node 0 100-deal seed; Nairobi 150 multi-node rehearsal seed) — not the same as live merchant inventory.
- **Human-owned prod gates:** migrations applied to live Supabase, env wiring, real-device golden path, IntaSend credentials, legal/DPA.
- **Future strategic path:** mall analytics / “Oracle-style” data products — **not built**, not sold as present capability.

## What is working

- Core money-path RPCs and SQL assertion suites in CI.
- Shopper/merchant/admin/agent surfaces implemented from the frozen wireframe system (plus later Discover/Browse/map work).
- Guardian verify-time checks with admin hold/release/appeal.
- Waitlist proxy to Resend with segment types.

## What is not yet ready

- Treating production feed inventory as “live marketplace” without confirming seed vs real merchants.
- Assuming M-Pesa top-ups work (IntaSend access still a blocker).
- Publishing lawyer-reviewed legal docs (blocked on Kenya incorporation decisions).
- Claiming multi-mall scale or a data-product business.

## Risks

- Docs (including older Notion pages) still say “Clerk-only” while rehearsal may run `MAANTA_AUTH_STRATEGY=supabase`.
- “Repo green” is routinely confused with “prod verified.”
- Seeded deals look like traction if not labeled.

## Dependencies

- BBS Mall operating presence and agent rota (ops, not code).
- Payment processor go-live decisions (Nov cutover planning).
- Founder-operated admin/dispute coverage at launch.

## Next actions

1. Keep this page short; put status detail on **Current State** and **Launch Readiness**.
2. Point investors to **What Is Real vs Staged vs Planned** before any demo.
3. Sync wording with repo overview after each material product change.

## Related pages

- Current State of MAANTA
- What Is Real vs Staged vs Planned
- Launch Readiness
- BBS Mall / Nairobi Rollout
- Product Flows
- Frozen Scope & Rules
- Decisions Log
