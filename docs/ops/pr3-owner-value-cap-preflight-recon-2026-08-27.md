# PR 3 reconnaissance — merchant owner value + deal-cap pre-flight

Date: 2026-08-27  
Base: `main @ d27c16317bfa78513099a4bc90bbf085adf72883`  
Status: discovery only — no product code changed

## Founder invariants preserved

- Standard = maximum 1 active deal.
- Elite = maximum 2 active deals.
- `public.enforce_deal_limit()` remains the authoritative enforcement point.
- KES 30 success-fee path is untouched.
- Elite pricing remains unpublished.
- No migration is expected for this package.
- Fast Visit and Points rules are not changed.

## What exists now

### Dashboard

`/merchant/dashboard` already reads:

- verified redemptions today;
- verified redemptions over the last 7 days;
- an all-time verified count from `getMerchantStats()`, though the all-time value is currently discarded;
- deal rows for lifecycle state;
- recent redemption rows;
- wallet balance;
- the merchant QR added by PR 2.

The page currently labels `countLiveDeals(...)/activeDealLimit(tier)` as **Active deals**.

### Deal creation

`/merchant/deals/new` mounts the whole client wizard immediately. It receives only:

- tier;
- success fee;
- can-deals permission;
- wallet balance.

It does not know how many cap slots the authoritative trigger considers occupied.

The create API intentionally attempts the INSERT and translates the trigger's `Deal limit reached` exception. This must remain the write authority.

### Deal lifecycle / D195

There are currently two legitimate but different definitions:

1. **Shopper-live deal** — `countLiveDeals()`: `is_active != false` and still claimable by `expires_at`.
2. **Cap-occupying deal** — the database trigger: `is_active = TRUE` only.

The trigger ignores `expires_at` and `is_paused`.

Nothing automatically flips `is_active=false` at expiry. Archiving is an explicit merchant action through `PATCH /api/deals/[id]` with `action=archive`.

Therefore a paused deal and an expired-but-unarchived deal occupy a slot.

A second UX problem follows: `/merchant/deals` fetches all `is_active=true` deals, then filters past-window rows out of the rendered list. An expired-but-unarchived deal can therefore consume the cap while being absent from the merchant's visible active-deals list.

This is D195's concrete user-facing failure mode.

## Recommended D195 ruling for PR 3

Do **not** change trigger semantics or add automatic archival in PR 3.

Keep both concepts and name them honestly:

- **Live deals** = shopper-visible / claimable now.
- **Deal slots** = rows with `is_active=true`, matching the trigger exactly.

Use **deal slots**, not `countLiveDeals()`, for every cap/pre-flight message.

This resolves the UI/authority mismatch without altering lifecycle behavior.

### Required merchant recovery path

If an expired-but-unarchived row occupies a slot, the merchant must be able to see and archive it.

Recommended `/merchant/deals` structure:

- **Live / paused deals** — current operational list.
- **Ended — archive to free a slot** — any `is_active=true` rows past the redemption window.

Do not silently archive them. The merchant explicitly archives; existing claimed codes retain their current validity rules.

## Wizard pre-flight

The server page `/merchant/deals/new/page.tsx` should read the merchant's current cap occupancy before mounting the expensive wizard:

`COUNT(deals WHERE merchant_id = current merchant AND is_active = TRUE)`

Then:

### Below cap

Render the existing wizard unchanged.

### At cap

Do not mount the wizard and do not invite an image upload.

Render a focused blocking state:

- Standard: **Standard includes 1 active deal.**
- Elite: **Elite includes up to 2 active deals.**
- Explain that the merchant must archive an existing/ended deal before creating another.
- Link to **Manage deals**.
- Standard may also show the existing approved Elite-benefits path, but no price and no automatic upgrade promise.

This is only a UX pre-flight. The INSERT trigger remains authoritative against races.

If another request fills the last slot after pre-flight, the existing API 409 still protects the write.

## Owner value dashboard

The owner question is:

> Is MAANTA bringing people to my shop?

Recommended first version uses only attributable facts already stored.

### This week

1. **Claims**
   - redemption rows whose authoritative `claimed_at` falls within the last 7 days.

2. **Verified visits**
   - `status='success'` and `redeemed_at` within the last 7 days.

3. **Claim → verified**
   - show only when denominator > 0.
   - label as a conversion ratio, not causal uplift.
   - Prefer a claim-cohort definition when practical: claims made in the period that have reached success / claims made in the period.
   - If implementation instead uses two independent time-window totals, label it explicitly and do not call it cohort conversion.

4. **Success fees**
   - sum `success_fee_charged` for successful redemptions in the period.
   - Merchant-facing wording remains **success fees**.

5. **Top deal**
   - deal with the highest verified-redemption count for the period.
   - Tie-break deterministically.
   - If no successful redemption exists, render an honest empty state.

6. **Fast Visits**
   - only surface when the feature is product-visible/appropriate.
   - qualification comes from persisted `fast_visit_qualified_at`; never recompute the 15-minute rule client-side.
   - Do not make this KPI necessary for PR 3 if the gate remains dark.

Do not add revenue-generated claims: MAANTA does not know the merchant's realised retail revenue merely from a verification.

## Read-failure doctrine

The current `getMerchantStats()` maps failed count reads to zero via `count ?? 0`. That violates the D164/D185 rule for a value dashboard.

PR 3 should introduce a merchant-owner stats query layer where each read can distinguish:

- successful zero;
- successful positive value;
- read failure.

The dashboard must not render `0` for a failed KPI query.

Preferred behavior:

- cards can render an unavailable marker / concise retry message;
- one failed KPI should not blank unrelated successful KPIs;
- log server-side failures with enough context to diagnose the merchant/query;
- no stack traces or database details in merchant copy.

The recent-redemptions list should follow the same rule if touched.

## Query/security posture

All owner queries use merchant identity derived from `getMerchantContext()`.

Where the service-role client is used, every merchant-scoped query must carry an explicit `.eq("merchant_id", merchant.id)` predicate. That predicate is a tenant boundary because the service client bypasses RLS.

No new client-side access to raw merchant analytics data is required.

No new public endpoint is required for the first version; server components can perform the reads.

No migration is currently justified. A read-only aggregate RPC could be considered later for scale, but Node 0 volumes do not require it for PR 3.

## Likely files

Expected implementation surface:

- `src/app/merchant/(app)/dashboard/page.tsx`
- `src/app/merchant/(app)/deals/new/page.tsx`
- `src/app/merchant/(app)/deals/new/new-deal-wizard.tsx` only if props/copy need small adjustment
- `src/app/merchant/(app)/deals/page.tsx`
- `src/lib/merchant.ts` or a new narrowly named merchant-owner-stats helper
- focused tests for cap occupancy, pre-flight, KPI failure states and metric definitions

The create/repost APIs should remain trigger-first and should not import the UI plan-limit helper as write authority.

## Test plan

### Cap/pre-flight

- Standard occupancy 0/1 → wizard allowed.
- Standard occupancy 1/1 → wizard blocked before data entry/upload.
- Elite occupancy 0/2 and 1/2 → wizard allowed.
- Elite occupancy 2/2 → wizard blocked.
- paused `is_active=true` row occupies a slot.
- expired `is_active=true` row occupies a slot.
- archived `is_active=false` row does not occupy a slot.
- API/trigger test remains the ultimate race authority.

### Recovery

- expired-but-unarchived slot occupant is visible to merchant.
- merchant can reach existing archive action.
- archiving frees the UI slot count.
- no silent deletion/archive.

### Owner metrics

- genuine zero is rendered as zero.
- failed query is not rendered as zero.
- claims derive from `claimed_at`.
- verified derives from successful redemption.
- fees sum only successful rows.
- top deal is deterministic.
- merchant A cannot read merchant B's data in any new service-client query.

## Recommendation

**GO for implementation as PR 3, with D195 treated as mandatory.**

Implementation order inside the PR:

1. establish an explicit `occupiedDealSlots` helper/query matching `is_active=true`;
2. fix merchant deal-list visibility for ended-but-unarchived slot occupants;
3. add server-side wizard pre-flight;
4. add failure-aware owner stats query layer;
5. render the small owner value dashboard;
6. run full app and DB/security gates.

Stop if implementation discovers that changing `is_active` automatically on expiry is required. That would be a lifecycle/database policy change and is outside this PR without a new founder ruling.
