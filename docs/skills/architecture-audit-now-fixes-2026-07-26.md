# Architecture audit — NOW fixes (2026-07-26)

**Mode:** Reviewer · **Scope:** `maanta-app/` + relevant `docs/` · **Out of
scope (explicit):** multi-mall expansion, IntaSend credentials, legal.

This audit ranks problems that can be fixed in code **now**. Each item names
paths and a concrete change an engineer can implement without re-exploring.

---

## Executive verdict

The money path (claim → verify → KES 30 / arrears) is well-isolated in RPCs.
The weak spots are **shopper browse performance & correctness under growth**,
**anon browse views that are column-safe but not row-safe**, **silent PostgREST
row-cap truncation on aggregate queries**, and **duplicated plan/fee copy**.
Most NOW items are safe (no money-path behavior change). A few need care
because they touch visibility predicates or aggregation semantics.

---

## NOW fixes — ranked

### P0 — Fix before traffic grows (correctness / silent wrong numbers)

#### P0-1. `getVerifiedCounts` full-row scan + PostgREST 1000-row silent truncate

**Files:** `maanta-app/src/lib/data.ts` (`getVerifiedCounts`, called from
`getLiveDeals`, `search/page.tsx`, `deals/[id]/page.tsx`, `shops/[id]/page.tsx`,
`my-deals/page.tsx`)

**Problem:** Selects every `redemptions` row matching
`merchant_id IN (…) AND status = 'success'`, then counts in JS. PostgREST
defaults to **max 1000 rows** with no error when truncated. A popular merchant
(or many merchants on the feed) silently under-counts verified redemptions —
ranking and “X verified” badges lie.

**Concrete change:**
1. Add a small RPC (migration), service_role only:

```sql
CREATE OR REPLACE FUNCTION public.verified_counts_by_merchant(p_ids uuid[])
RETURNS TABLE(merchant_id uuid, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.merchant_id, COUNT(*)::bigint
  FROM public.redemptions r
  WHERE r.status = 'success'
    AND r.merchant_id = ANY(p_ids)
  GROUP BY r.merchant_id;
$$;
-- REVOKE from anon/authenticated; GRANT to service_role only.
```

2. Rewrite `getVerifiedCounts` to `.rpc("verified_counts_by_merchant", { p_ids: ids })`
   and build the `Map` from `{ merchant_id, cnt }`.
3. Keep the empty-ids early return.
4. Add a vitest with a mocked RPC; add a pgTAP that inserts >0 success rows and
   asserts counts.
5. Optional micro-opt for single-id callers: `select("id", { count: "exact", head: true })`
   — but the RPC covers all call sites cleanly.

**Care:** Safe for money path (read-only). **Do not** substitute monthly
`kpi_counters.successful_redemptions` without documenting that shopper “verified”
becomes period-scoped (product change).

**Safety:** SAFE (no money-path behavior change; display/ranking accuracy only).

---

#### P0-2. Anon `*_public_browse` views are not row-filtered

**Files:**
- `maanta-app/supabase/migrations/20260723130000_fix_browse_views_security_invoker.sql`
- `maanta-app/supabase/migrations/20260726120000_merchant_lat_lng.sql`
- (new migration)
- Docs claim in `maanta-app/src/lib/README.md` (“matches … `*_public_browse` views”)

**Problem:** Views project safe columns but `SELECT … FROM merchants/deals`
**with no WHERE**. With `security_invoker = false` and `GRANT SELECT … TO anon`,
an anon PostgREST client can list **pending / shadow-banned / invisible**
merchants and their deals (titles, prices, images). App browse currently uses
service client + `withPublicMerchant*` (correct), so the UI is fine — the
**views are the footgun** and the README is wrong.

**Concrete change:** New migration replacing both views:

```sql
CREATE OR REPLACE VIEW public.merchants_public_browse
WITH (security_invoker = false) AS
  SELECT id, merchant_name, tier, status, node, what3words_address,
         mall_name, floor, unit_number, is_visible, is_featured,
         trust_metric, lat, lng
  FROM public.merchants
  WHERE status = 'active'
    AND is_visible = TRUE
    AND is_shadow_banned = FALSE;

CREATE OR REPLACE VIEW public.deals_public_browse
WITH (security_invoker = false) AS
  SELECT d.id, d.merchant_id, d.node, d.title, d.description, d.image_url,
         d.deal_type, d.flash_duration_hours, d.is_active, d.max_claims,
         d.claims_count, d.boost_active, d.price_kes, d.compare_at_kes,
         d.charges, d.starts_at, d.expires_at, d.created_at
  FROM public.deals d
  WHERE d.is_active = TRUE
    AND d.expires_at > NOW()
    AND EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = d.merchant_id
        AND m.status = 'active'
        AND m.is_visible = TRUE
        AND m.is_shadow_banned = FALSE
    );
```

Extend `supabase/tests/browse_views_test.sql` with a shadow-banned / pending
merchant that must **not** appear. Fix README sentence to say views now enforce
the same predicate.

**Care:** Changing view filters can surprise anyone already querying views
expecting all rows (admin should use base tables). App shopper paths don’t use
views today — switching them over is separate (see P1-5).

**Safety:** SAFE for money path; **visibility / security** — treat as
high-priority. Review grants after replace.

---

#### P0-3. Admin reports success-fee revenue truncated / JS-summed

**File:** `maanta-app/src/app/admin/reports/page.tsx`

**Problem:**
```ts
.from("merchant_transactions").select("amount")
.eq("transaction_type", "success_fee").gte("created_at", since)
```
then `reduce` in JS. Same PostgREST **1000-row cap** → understated revenue once
volume grows. Chart query similarly pulls all success `redeemed_at` rows.

**Concrete change:**
- Revenue: use an RPC or `.select("amount.sum()")` / PostgREST aggregate
  (`select("amount")` with a DB view/`sum()` RPC). Prefer:

```sql
SELECT COALESCE(SUM(ABS(amount)), 0) FROM merchant_transactions
WHERE transaction_type = 'success_fee' AND created_at >= p_since;
```

- Chart: `GROUP BY date_trunc('day', redeemed_at)` in SQL, not JS bucketing of
  raw rows.
- Keep `count: exact, head: true` pattern already used for verified count.

**Safety:** SAFE (admin display only). Care: abs(amount) matches current UI
semantics (fees are negative ledger rows).

---

### P1 — High value, cheap, do next

#### P1-1. `getLiveDeals` hard `limit(60)` + no pagination + wrong ranking window

**File:** `maanta-app/src/lib/data.ts` (`getLiveDeals`)  
**Callers:** `feed/page.tsx`, `browse/page.tsx`

**Problem:** Orders by `created_at DESC`, takes 60, then partitions into
flash / boosted / nearMe and re-sorts nearMe by verified counts. Effects:
- Older live deals never appear.
- A node with >60 live deals silently drops inventory.
- Ranking is among the newest 60 only, not among all live deals.
- Feed and Browse share the same capped set (Browse map incomplete).

**Concrete NOW change (minimal product impact):**
1. Raise the intentional catalog ceiling for Node 0 (e.g. `limit(200)`) **or**
   better: three targeted queries (flash, boosted, standard) each with its own
   limit (e.g. 20/20/40) instead of one mixed 60 then filter — so flash/boosted
   can’t be crowded out by standard deals.
2. Add `?cursor=` / `offset` later (LATER).
3. Document the cap in `getLiveDeals` JSDoc and empty-state copy if truncated
   (optional debug header in non-prod).

**Safety:** SAFE for money path. **Mild product care:** changing which deals
appear on Discover is user-visible; prefer three-bucket queries over a blind
limit bump so behavior is intentional.

---

#### P1-2. Missing composite index for verified-count / merchant stats path

**File:** new migration under `maanta-app/supabase/migrations/`

**Problem:** Baseline has `idx_redemptions_merchant` and `idx_redemptions_status`
separately. Hot filter is `(merchant_id, status[=success])` (+ sometimes
`redeemed_at`). Bitmap combine works but is weaker under load.

**Concrete change:**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_redemptions_merchant_status
  ON public.redemptions (merchant_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_redemptions_merchant_status_redeemed
  ON public.redemptions (merchant_id, status, redeemed_at DESC)
  WHERE status = 'success';
```
(Use non-CONCURRENTLY in Supabase migration runner if concurrent isn’t
supported in their apply path — match existing migration style.)

Also consider covering feed order:
```sql
CREATE INDEX IF NOT EXISTS idx_deals_node_live_created
  ON public.deals (node, is_active, expires_at, created_at DESC);
```
existing `idx_deals_node_active (node, is_active, expires_at)` doesn’t include
`created_at`.

**Safety:** SAFE (indexes only). Care: migration time on large tables — fine at
Node 0 size.

---

#### P1-3. Analytics hardcodes `node: "BBS Mall"`

**File:** `maanta-app/src/lib/analytics.ts` (every `capture*` helper)  
**Tests:** `src/lib/__tests__/analytics.test.ts`  
**Call sites:** claim / verify / deals / onboard / top-up / deal view routes

**Problem:** Every server PostHog event stamps `node: "BBS Mall"` regardless of
`merchants.node` / `deals.node`. Breaks breakdowns the moment any non-BBS row
exists (or for “all nodes” browsing).

**Concrete change:**
1. Add `node: string` (required) to each `capture*` args object.
2. Pass `merchant.node` or `deal.node` from callers (already loaded in most
   paths). Onboard route already hardcodes `p_node: "BBS Mall"` — pass
   `DEFAULT_NODE` from `@/lib/nodes` instead of a string literal in both
   onboard + analytics.
3. Update analytics test expectation to use the passed node.
4. Do **not** invent multi-mall product — just stop lying in events.

**Safety:** SAFE (telemetry only).

---

#### P1-4. Request-scoped memo for `createServiceClient` / `getSuccessFee` / `getBoostFee`

**Files:**
- `maanta-app/src/lib/supabase/service.ts`
- `maanta-app/src/lib/data.ts`
- Merchant layout alone calls `getSuccessFee()` while children often call it
  again (`redeem`, `wallet`, `alerts`, `plan/*`, `support`, `deals/new`).

**Problem:** Every call does `createClient(...)` + (for fees) a fresh
`app_config` round-trip. Not wrong, but wasteful on every merchant page SSR.

**Concrete change:**
1. Module singleton for service client (env is process-stable; no per-request
   auth on service role):

```ts
let _client: ReturnType<typeof createClient> | null = null;
export function createServiceClient() {
  if (_client) return _client;
  // ... validate env ...
  _client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return _client;
}
```

2. Wrap `getSuccessFee` / `getBoostFee` in `React.cache()` so one RSC request
   dedupes. Optionally `unstable_cache(..., ["app_config", key], { revalidate: 300 })`
   for cross-request caching of immutable-ish config.

**Safety:** SAFE. Care: tests that mock `createServiceClient` must still work
(singleton reset helper for tests if needed: `export function __resetServiceClientForTests()`).

---

#### P1-5. Align feed/browse query shape with `deals_public_browse` (after P0-2)

**Files:** `data.ts` (`getLiveDeals`, `getDeal`, `selectDealsWithMerchants`);
optionally `search/page.tsx`, `shops/[id]/page.tsx`, `malls/bbs-mall/page.tsx`

**Problem:** App bypasses the browse views and re-implements joins + visibility
on base tables via service role. After P0-2, views become the single row+column
contract. Today `DEAL_SELECT` also pulls `success_fee` onto every shopper card
payload (unnecessary).

**Concrete NOW change (incremental):**
1. After view fix: query `deals_public_browse` + join `merchants_public_browse`
   (or a single SQL view `deals_with_merchant_public`) from service **or** anon
   client for public pages.
2. Drop `success_fee` from public select lists; keep it on merchant/admin paths.
3. Keep `withPublicMerchant*` as defense-in-depth if still on base tables, or
   delete helpers once all public reads use views (update
   `__tests__/visibility.test.ts`).

**Safety:** SAFE if view filters match helpers exactly (pin with SQL + vitest).
**Care:** service-role vs anon — if switching to anon, Clerk middleware + RLS
story must stay consistent; staying on service client + views is lower risk.

---

#### P1-6. Safe caching for public browse / marketing mall page

**Files:**
- `maanta-app/src/app/(public)/malls/bbs-mall/page.tsx` — `force-dynamic` + live
  counts with **no limit** on deals select (pulls all live BBS deals into Node
  just to count-by-floor).
- `feed/page.tsx` / `browse/page.tsx` — must stay request-dynamic because of
  `cookies()` (`maanta_node`) and favourites, but the **deal catalog** can be
  cached.

**Concrete change:**
1. **bbs-mall:** replace `force-dynamic` with `export const revalidate = 60`.
   Use `count: exact, head: true` for deal totals; for floors use
   `select("id, merchants!inner(floor)")` with public predicate **or** a tiny
   RPC `live_deals_by_floor(node)` returning aggregates — do not materialize
   every deal row.
2. **Feed catalog:** wrap core deal fetch in `unstable_cache(async () =>
   getLiveDeals(node), ["live-deals", node], { revalidate: 30 })`. Call after
   reading cookie. Keep `getAppUser` / favourites outside the cache.
3. Leave merchant/admin `force-dynamic` alone (auth + balances).

**Safety:** SAFE. Care: 30–60s stale deals/flash expiry is acceptable for
browse; do **not** cache claim/verify/wallet paths. Flash countdown UI should
still compute from `expires_at` client/server at render time.

---

#### P1-7. Duplicate Elite / success-fee copy (config vs literals)

**Files (Elite KES 3,500 hardcoded):**
- `src/app/(public)/pricing/page.tsx`
- `src/app/merchant/(app)/plan/page.tsx`
- `src/app/merchant/(app)/plan/upgrade/page.tsx`
- `src/app/merchant/(app)/deals/new/new-deal-wizard.tsx`
- (onboard suggests KES 3,000 wallet — different number)

**Success fee:** `getSuccessFee()` is correct for merchant app; marketing
`(public)/*` intentionally hardcodes per `src/lib/README.md`. Fallback `30` /
`500` in `getSuccessFee` / `getBoostFee` is fine.

**Gap:** There is **no** `app_config.elite_monthly_kes` key (only
`success_fee_kes`, `boost_fee_kes`, node0_*, guardian_thresholds).

**Concrete NOW change (pick one):**
- **A (preferred):** Seed `elite_monthly_kes = 3500` in a migration; add
  `getEliteMonthlyFee()` beside `getSuccessFee`; wire merchant plan pages +
  new-deal wizard. Leave `(public)/pricing` static **or** make it async and
  read config (founder call).
- **B (minimal):** `src/lib/plan-prices.ts` with `ELITE_MONTHLY_KES = 3500` and
  `SUCCESS_FEE_FALLBACK_KES = 30` imported everywhere instead of literals.

**Safety:** SAFE (display). Care: do not change DB debit amounts — Elite
subscription charging isn’t automated in the money RPC path the same way as
success fee; this is copy/config alignment only.

---

#### P1-8. API RPC error-mapping duplication

**Files:**  
`api/redemptions/route.ts`, `redemptions/verify/route.ts`, `deals/route.ts`,
`deals/repost/route.ts`, `boosts/route.ts`, `boosts/move/route.ts`,
`merchants/onboard/route.ts` — each hand-rolls `message.includes(...)` → status
+ userMessage. Most money/auth failures only `console.error`, never
`Sentry.captureException` (unlike `merchant-ledger.ts`).

**Concrete change:**
1. Add `src/lib/api-rpc-errors.ts`:

```ts
export function mapRpcError(
  error: { message?: string } | null,
  table: Array<{ match: string | RegExp; status: number; userMessage: string }>
): { status: number; userMessage: string; known: boolean }
```

2. One shared helper `jsonRpcFailure(error, table, logLabel)` that logs +
   `Sentry.captureException` when `!known`.
3. Migrate routes one-by-one without changing status codes/messages (copy
   existing tables verbatim first; ratchet with existing route tests).

**Safety:** SAFE if messages/statuses unchanged. Care: money routes —
preserve exact client-facing codes (`phone_required`, 409 already-redeemed,
etc.).

---

#### P1-9. Health / monitoring cheap wins

**Files:** `src/lib/health.ts`, `src/app/api/healthz/route.ts`

**Gaps (code-fixable):**
1. No **readiness** distinct from liveness — public `/api/healthz` always
   `{ status: "ok" }` even if Supabase env missing (by design today). Add
   optional public `?ready=1` that returns **503** when
   `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
   Clerk keys absent (booleans only, no secrets) — useful for Vercel/uptime
   without admin auth.
2. Admin `probeSupabase` doesn’t check `app_config` row `success_fee_kes`
   exists — add `appConfig: boolean` to probe (select key, limit 1).
3. Wire `Sentry.captureException` (or `captureMessage`) on unexpected 500
   branches in claim/verify (P1-8).
4. Admin surface for `payment_webhook_failures` count last 24h (read-only page
   or healthz probe field) — cheap ops win; table already written by webhooks.

**Safety:** SAFE. Care: don’t put secrets or connection strings in ready
payload; don’t make public ready probe hit the DB on every uptime poll more
than once/minute (cache probe result 30s in-module).

---

#### P1-10. Search `ilike` without index + dual query

**File:** `src/app/(shopper)/search/page.tsx`

**Problem:** Leading-wildcard `ilike('%q%')` on `title` and
`merchants.merchant_name`; two round-trips; `limit(30)` each. Fine at Node 0
size; will degrade.

**Concrete NOW:**
- Add `pg_trgm` + GIN indexes on `deals.title` and `merchants.merchant_name`
  (migration), **or**
- Collapse to one query with `or(title.ilike..., merchants.merchant_name.ilike...)`
  via PostgREST `or` filter to cut latency in half immediately.

**Safety:** SAFE.

---

## Safety summary — NOW items

| ID | Safe (no money-path behavior change)? | Extreme care? |
|---|---|---|
| P0-1 verified counts RPC | Yes | Don’t swap in period-scoped KPI without product sign-off |
| P0-2 browse view row filters | Yes (money) | Visibility/security — test shadow-ban/pending |
| P0-3 admin reports aggregates | Yes | Preserve abs(fee) semantics |
| P1-1 feed limit / buckets | Yes | User-visible catalog composition |
| P1-2 indexes | Yes | Migration apply style |
| P1-3 analytics node | Yes | — |
| P1-4 client/fee memo | Yes | Test mocks / singleton reset |
| P1-5 use browse views | Yes | Must match visibility predicate exactly |
| P1-6 caching | Yes | Never cache claim/verify/wallet; TTL for flash |
| P1-7 Elite price centralize | Yes | Display only; not subscription ledger |
| P1-8 RPC error helper | Yes | Freeze existing status/message pairs |
| P1-9 healthz ready/probe | Yes | No secret leakage; rate DB probes |
| P1-10 search index/or | Yes | — |

---

## LATER (do not implement in this pass)

1. **Multi-mall live flags / onboard any node** — product expansion.
2. **IntaSend credentials + live STK** — commercial gate, not code.
3. **Legal publish / Kenya DPA / eu-west-1 residency** — legal.
4. **True feed cursor pagination + infinite scroll** — after P1-1 bucket fix
   proves insufficient.
5. **Denormalized `merchants.verified_redemption_count` maintained by trigger** —
   nicer than RPC at huge scale; requires money-adjacent trigger discipline.
6. **CDN/edge caching of whole shopper HTML** — blocked by Clerk middleware +
   node cookie personalization.
7. **SLA-backed FX provider** — only when live non-KES charges matter.
8. **Automated dispute routing / admin staffing tooling**.
9. **Trigram/search redesign (Typesense/Meilisearch)** — overkill at BBS.
10. **Replacing service-role public browse with pure anon RLS** end-to-end —
    larger auth architecture change.
11. **Elite subscription auto-billing** — price under review Feb 2027; not a
    browse/perf fix.
12. **Connection pooling / Supabase pooler tuning for 100k** — ops, not now.

---

## Evidence anchors (for implementers)

| Suspect | Finding |
|---|---|
| `getLiveDeals` / `getVerifiedCounts` | Confirmed: `limit(60)`; full redemption row pull; no pagination |
| Analytics BBS hardcode | Confirmed: 8 helpers in `analytics.ts` |
| `createServiceClient` per call | Confirmed: factory with no singleton/`React.cache` |
| `force-dynamic` | ~50 routes; public marketing mostly static already; bbs-mall + feed are the wins |
| Fee hardcoding | Success fee config-driven in merchant app; Elite 3500 duplicated; no `elite_monthly_kes` |
| Indexes | Baseline indexes exist; composite `(merchant_id, status)` and live+`created_at` missing |
| Health | Liveness solid; no public readiness 503; no app_config probe |
| API errors | Duplicated mappers; console-only on many 500s |
| Browse views | Unused by app; column-safe, **not** row-safe; README overclaims |

---

## Suggested implementation order

1. P0-1 (verified counts RPC) + P1-2 (indexes) — same PR family  
2. P0-2 (view filters) + browse_views tests + README  
3. P0-3 (admin aggregates)  
4. P1-3 (analytics node) + P1-4 (singleton/cache) — tiny PRs  
5. P1-1 (feed buckets) → P1-6 (unstable_cache) → P1-5 (optional view adoption)  
6. P1-7, P1-8, P1-9, P1-10 as cleanup train  

---

*Written 2026-07-26 as the durable artifact for the architecture-audit session.*
