# System design — pre-10k readiness

Last updated: 2026-08-01 · Status: **repo implementation complete**; prod apply is human-owned.

> **2026-08-01 — scope note.** This document is the **pre-10k** baseline and stays
> scoped to that. Cost per redemption, the per-MAU auth curve, multi-node
> economics and the security findings are in
> `docs/skills/scaling-cost-security-audit-2026-08-01.md` (drift rows
> **D58–D66**). One row below was corrected in the same pass — see Multi-node.

## Stack

| Layer | Technology | 10k notes |
|---|---|---|
| App | Next.js 14 App Router (single region) | Adequate for 10k users at Node 0; no multi-region yet |
| Auth | Clerk (session) + Supabase third-party JWT | Roles in `public.users.role`, not Clerk metadata |
| Data | Supabase Postgres 17 + RLS | Single project `axrrslqssmbngbataejg`; money path in RPCs |
| Email | Resend | Waitlist + transactional; prod keys required |
| Monitoring | Sentry + PostHog (opt-in via env) | DSN wiring still open on Vercel |
| Payments | Stripe (sandbox) + IntaSend (M-Pesa prep) | Merchant top-ups only; shoppers pay cash off-app |

## Architecture strengths

- Money path enforced in Postgres (`claim_deal`, `verify_redemption`) with 15 SQL assertion suites.
- Public browse uses a single visibility predicate (`withPublicMerchant`) shared with RLS.
- Admin ops are audit-logged (`admin_ops_log`).
- Feed/Browse hot reads use 30s `unstable_cache` per node (`getLiveDeals`).

## Known limitations (acceptable pre-10k)

| Area | Limitation | Mitigation |
|---|---|---|
| Caching | 30s node-scoped cache only | Sufficient for launch; invalidate via tag when deal CRUD ships |
| Roles | No separate `founder` DB enum — uses `admin` | Documented in `docs/skills/role-permissions.md` |
| Notifications | Prefs are device-local (localStorage) | Server column planned; push API exists |
| Multi-node | Reporting is Node 0 first | Corrected 2026-08-01, part-fixed 2026-08-02 (**D62**). A `public.nodes` registry now exists and `deals.node` / `merchants.node` carry a foreign key, so a rename no longer orphans rows and an unregistered node cannot be written (`maanta-app/supabase/migrations/20260802120000_nodes_registry.sql`). **Still open:** the migration needs a human `db push`, and node *selection* still validates against the compiled `src/lib/nodes.ts`, so opening a mall is two places — held in step by a parity guard — not yet one row |
| E2E | Playwright self-skips without secrets | Opt-in `e2e.yml` workflow |

## Data model (Node 0)

- **Merchants:** 60 seeded at BBS Mall with lat/lng (`20260726120000_merchant_lat_lng.sql`).
- **Deals:** 100-deal seed (`supabase/seed/node0_100_deals_seed.sql`) — 15 flash / 20 boosted / 65 standard.
- **Users:** `customer` (shopper), `merchant_admin` / `merchant_staff`, `agent`, `admin`.

## Performance hot paths

| Query | Cache | Bottleneck risk at 10k |
|---|---|---|
| `getLiveDeals(node)` | 30s per node | Low — capped at 60 deals per request |
| `getVerifiedCounts` | None (inside cache window) | Low — batched IN query |
| Browse map pins | Client-side filter | Medium — same payload as feed |
| Claim/verify RPCs | None (correct) | Low — row-level locks |

## Ops & resilience

- **Health:** `GET /api/healthz` (public liveness + admin env presence).
- **Errors:** Feed error boundary distinguishes DB failure from empty state.
- **Backups:** Supabase managed (hosted); local via `supabase start` + migrations.
- **Deploy:** Vercel preview → production; migrations via `Makefile db-push` (human-run).

## Dashboards

| Route | Audience | Purpose |
|---|---|---|
| `/founder` | Admin-role founders | Executive KPIs + ops shortcuts |
| `/admin/*` | Admins + agents (scoped) | Approvals, redemptions, support, reports |
| `/merchant/(app)/*` | Merchants | Redeem, deals, wallet |
| `/agent/*` | Field agents | Lead capture + attribution |

## Pre-10k checklist (human-owned)

1. Apply migrations to hosted Supabase (`make db-push`).
2. Run 100-deal seed: `export DATABASE_URL=… && ./scripts/apply-100-deals-seed.sh`.
3. Wire Vercel env (Clerk, Supabase, Sentry, PostHog, Resend).
4. Real-device golden path at BBS Mall (2 phones).
5. IntaSend M-Pesa go-live when available.

## Post-10k recommendations

- Multi-region read replicas or edge caching for public browse.
- Server-persisted notification preferences + segment analytics.
- Dedicated `founder` role if co-founders should not access fee reversal.
- Mall-operator dashboard (deferred from frozen UI).
- Cohort retention analytics in PostHog.
