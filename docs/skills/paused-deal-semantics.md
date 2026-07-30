# Paused-deal semantics (shopper discovery + claim + till)

Last updated: 2026-07-30.

**Rule (founder):** If a shopper claimed a deal while it was **active**, the
ticket stays valid and visible and merchant staff can verify it until ticket
expiry. As soon as the merchant pauses that deal, it must **immediately
disappear from all shopper discovery surfaces** (feed / browse / map), and no
other shopper can claim it. Enforcement lives in the **backend / RPC**, not
only in UI hiding.

## Narrative

> Claimed while active → ticket stays; pausing hides the deal from discovery
> and blocks new claims; existing tickets remain redeemable until expiry.
> Resume (while the deal is otherwise valid) puts it back in feed/browse/map
> and makes it claimable again.

## Layers

| Layer | Behaviour |
|---|---|
| `claim_deal` RPC | Early `RAISE EXCEPTION 'deal_paused'` when `deals.is_paused` and this is a **new** claim. No redemption row, no money movement. Migration `20260730180000_restore_claim_deal_pause_gate.sql` (D25 — pending human `db push` on prod). |
| `verify_redemption` RPC | **Ignores** `is_paused`. Ticket validity = pending + `redemptions.expires_at` (+ Guardian). |
| `deals_public_browse` | SQL discovery view excludes `is_paused` (`20260730190000_paused_deals_discovery_filter.sql`). |
| App rails | `getLiveDeals` → `.eq("is_paused", false)` for feed, browse, map. |
| Deal detail | Unclaimed + paused → “Deal paused by merchant”, claim disabled. Own live ticket → “View your ticket” (still valid). |
| My deals / tickets | Redemptions list is pause-agnostic; ticket page notes pause if the deal is paused. |
| Merchant UI | Pause/resume on `/merchant/deals/[id]`; redeem banner when any deal is paused. |
| Claim API | `POST /api/redemptions` maps `deal_paused` → HTTP 409 + `{ code: "deal_paused" }`. |

## Ops verification

```sql
-- Claim gate must contain the deal_paused branch:
SELECT pg_get_functiondef(
  'public.claim_deal(uuid,uuid,text,extensions.geography)'::regprocedure
);
-- Expect: RAISE EXCEPTION 'deal_paused'

-- Discovery view must exclude paused rows:
SELECT pg_get_viewdef('public.deals_public_browse'::regclass, true);
-- Expect: is_paused IS NOT TRUE (or equivalent)
```

Local / CI proof: `supabase/tests/claim_deal_pause_gate_test.sql` (scenarios A–C).

## What #146 already did

- Hid paused deals from shopper rails via `getLiveDeals`.
- Detail CTA “Deal paused” (now tightened to “Deal paused by merchant”).
- Did **not** close D25 (RPC not live on prod until `db push`).

## Related drift

- **D25** — pause gate migration not yet applied on production (pending-deploy).
- **D32** — browse view previously advertised paused deals (closed by `190000`).
