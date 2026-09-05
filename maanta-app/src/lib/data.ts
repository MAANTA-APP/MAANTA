import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import {
  isMissingDealCategoryColumnError,
  isMissingLatLngColumnError,
  type PostgrestLikeError,
} from "@/lib/supabase/postgrest-errors";
import { ensureAppUser } from "@/lib/auth";
import { ALL_NODES, DEFAULT_NODE, NODE_COOKIE, NODES } from "@/lib/nodes";
import { PUBLIC_MERCHANT_CONDITIONS } from "@/lib/merchant-visibility";
import { SUCCESS_FEE_KES } from "@/lib/pricing";
import type { AppRole } from "@/lib/roles";
import {
  lockedBoostedOrder,
  lockedFlashOrder,
  lockedStandardOrder,
} from "@/lib/deal-list-controls";
import {
  SHOPPER_INVENTORY_BYPASS_COOKIE,
  shouldBypassLiveDealsCache,
} from "@/lib/shopper-inventory";

export { isMissingLatLngColumnError } from "@/lib/supabase/postgrest-errors";
export {
  PUBLIC_MERCHANT_CONDITIONS,
  publicMerchantBlocker,
  isPublicMerchant,
  type PublicMerchantFacts,
} from "@/lib/merchant-visibility";

/** Currently selected node (mall) from the cookie set by the node switcher. */
export function getSelectedNode(): string {
  const raw = cookies().get(NODE_COOKIE)?.value;
  if (!raw) return DEFAULT_NODE;
  const decoded = decodeURIComponent(raw);
  if (decoded === ALL_NODES) return ALL_NODES;
  return NODES.some((n) => n.id === decoded && n.live) ? decoded : DEFAULT_NODE;
}

export type AppUser = {
  id: string;
  clerk_user_id: string | null;
  auth_uid: string | null;
  phone: string | null;
  email: string | null;
  full_name: string | null;
  /** From `@/lib/roles`, not spelled out here — one union, one place to extend. */
  role: AppRole;
};

/** The signed-in Clerk user's public.users row (null when signed out). */
export async function getAppUser(): Promise<AppUser | null> {
  return ensureAppUser<AppUser>(
    "id, clerk_user_id, auth_uid, phone, email, full_name, role"
  );
}

export type MerchantRow = {
  id: string;
  user_id: string;
  merchant_name: string;
  tier: "standard" | "elite";
  status: string;
  elite_trial_active: boolean;
  trial_ends_at: string | null;
  grace_period_ends_at: string | null;
  node: string;
  /** Nullable since D162 — coordinates are the canonical location, w3w is enrichment. */
  what3words_address: string | null;
  lat: number | null;
  lng: number | null;
  mall_name: string | null;
  floor: string | null;
  unit_number: string | null;
  /** Nullable since D158 — optional for a merchant with a verified email. */
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  account_balance: number;
  outstanding_arrears: number;
  onboarded_at: string | null;
};

/** The merchant owned by (or staffed by) this app user, if any. */
export async function getMerchantForUser(userId: string): Promise<MerchantRow | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("merchants")
    .select(
      "id, user_id, merchant_name, tier, status, elite_trial_active, trial_ends_at, grace_period_ends_at, node, what3words_address, lat, lng, mall_name, floor, unit_number, phone, email, whatsapp, account_balance, outstanding_arrears, onboarded_at"
    )
    .eq("user_id", userId)
    .maybeSingle();
  return (data as MerchantRow) ?? null;
}

/** Canonical success fee from app_config (never hardcode KES 30). */
export async function getSuccessFee(): Promise<number> {
  const service = createServiceClient();
  const { data } = await service
    .from("app_config")
    .select("value")
    .eq("key", "success_fee_kes")
    .maybeSingle();
  const n = data ? parseFloat(data.value) : NaN;
  return isNaN(n) ? SUCCESS_FEE_KES : n;
}

/**
 * The length of one boost window, in hours.
 *
 * `purchase_boost` owns this: it writes `NOW() + INTERVAL '24 hours'`
 * (`supabase/migrations/20260709175532_deal_pause_boosts_staff.sql`). The number
 * was typed as the literal "24h" in three merchant surfaces and is now also
 * stated to shoppers in the paid-placement disclosure on `/deals/[id]`. A
 * disclosure that disagreed with the window it discloses would be worse than
 * none, so the shopper-facing sentence reads it from here rather than typing it
 * a fourth time. Unlike the fee, it is not in `app_config` — changing it means
 * changing the RPC, and this constant must move with it.
 */
export const BOOST_WINDOW_HOURS = 24;

/** Boost price from app_config, falling back to the wireframe default KES 500 / 24h. */
export async function getBoostFee(): Promise<number> {
  const service = createServiceClient();
  const { data } = await service
    .from("app_config")
    .select("value")
    .eq("key", "boost_fee_kes")
    .maybeSingle();
  const n = data ? parseFloat(data.value) : NaN;
  return isNaN(n) ? 500 : n;
}

export type DealRow = {
  id: string;
  merchant_id: string;
  node: string;
  title: string;
  description: string | null;
  image_url: string;
  deal_type: "standard" | "flash";
  /**
   * Shopper-facing category key (`fashion` | `beauty` | `food`), or null for
   * deals created before the taxonomy existed. Optional at the type level, not
   * just nullable: until `20260818150000_deal_categories.sql` is applied the
   * column is absent from the select and the field is genuinely `undefined`, and
   * a type that promised `string | null` would make that state unrepresentable
   * while it is exactly the state production is in.
   */
  category?: string | null;
  flash_duration_hours: number;
  is_active: boolean;
  /** When true, deal is hidden from shopper feed/browse/map and new claims fail. */
  is_paused: boolean;
  /**
   * Synthetic row. Optional at the type level for the same reason as
   * `category`: a remote that predates the column returns it as `undefined`,
   * and a card must then fall back to labelling nothing rather than crash.
   * Rendered as a per-card "Demo" badge (founder direction 2026-09-05).
   */
  is_demo?: boolean;
  max_claims: number | null;
  claims_count: number;
  /** D236: claims ISSUED — what `max_claims` caps. Distinct from claims_count. */
  claims_reserved: number;
  success_fee: number;
  boost_active: boolean;
  price_kes: number | null;
  compare_at_kes: number | null;
  charges: unknown;
  starts_at: string;
  expires_at: string | null;
  merchants: {
    id: string;
    merchant_name: string;
    floor: string | null;
    unit_number: string | null;
    what3words_address: string;
    lat: number | null;
    lng: number | null;
    mall_name: string | null;
    node: string;
  } | null;
};

/** Merchants join without GPS — used when `20260726120000_merchant_lat_lng` is not on the remote yet. */
export const DEAL_SELECT_WITHOUT_LAT_LNG =
  "id, merchant_id, node, title, description, image_url, deal_type, category, flash_duration_hours, is_active, is_paused, is_demo, max_claims, claims_count, claims_reserved, success_fee, boost_active, price_kes, compare_at_kes, charges, starts_at, expires_at, merchants!inner(id, merchant_name, floor, unit_number, what3words_address, mall_name, node, is_visible, is_shadow_banned, status)";

export const DEAL_SELECT =
  "id, merchant_id, node, title, description, image_url, deal_type, category, flash_duration_hours, is_active, is_paused, is_demo, max_claims, claims_count, claims_reserved, success_fee, boost_active, price_kes, compare_at_kes, charges, starts_at, expires_at, merchants!inner(id, merchant_name, floor, unit_number, what3words_address, lat, lng, mall_name, node, is_visible, is_shadow_banned, status)";

type DealSelectResult = {
  data: unknown;
  error: PostgrestLikeError | null;
};

function asDealRows(data: unknown): DealRow[] {
  if (data == null) return [];
  const rows = Array.isArray(data) ? data : [data];
  return (rows as DealRow[]).filter((d) => d?.merchants);
}

/** `select` minus `category`, for a remote that has not had the column added yet. */
export function dealSelectWithoutCategory(select: string): string {
  return select.replace(", category,", ",");
}

/**
 * Run a deals+merchants select, degrading the column list rather than failing
 * when the remote schema is behind this deploy.
 *
 * Two columns can be absent independently: `merchants.lat/lng`
 * (`20260726120000`) and `deals.category` (`20260818150000`). Claude never
 * applies migrations to production, so code that reads a column always ships
 * before the column exists, for a window nobody can predict. A 500 on the
 * shopper feed for that window is a much worse product than a missing distance
 * label or an absent category chip, so each missing column costs its own
 * feature and nothing else.
 *
 * A loop rather than a nested pair of fallbacks because the two gaps are not
 * ordered: Postgres names one unknown column per error, and which one it names
 * first is not something to rely on. Each attempt drops exactly the column the
 * error actually named; three attempts is enough to shed both and still make the
 * real request.
 *
 * The LAST error is what gets thrown. An earlier one is, by construction, a
 * missing column this function deliberately decided to work around — surfacing
 * "column deals.category does not exist" while the query is actually failing on
 * "permission denied" points the operator at the wrong problem. This is a
 * correction: it originally threw the first error, on the reasoning that a later
 * one might be noise, which had it backwards. The two sibling helpers in
 * `@/lib/deal-category-column` already behaved this way, so all three now agree.
 */
export async function selectDealsWithMerchants(
  run: (select: string) => PromiseLike<DealSelectResult>
): Promise<DealRow[]> {
  let withLatLng = true;
  let withCategory = true;
  let lastError: PostgrestLikeError | null = null;

  // 3 = one attempt, plus one narrowing per droppable column.
  for (let attempt = 0; attempt < 3; attempt++) {
    const base = withLatLng ? DEAL_SELECT : DEAL_SELECT_WITHOUT_LAT_LNG;
    const select = withCategory ? base : dealSelectWithoutCategory(base);
    const result = await run(select);

    if (!result.error) {
      const rows = asDealRows(result.data);
      return withLatLng
        ? rows
        : rows.map((d) => ({
            ...d,
            merchants: d.merchants
              ? {
                  ...d.merchants,
                  lat: typeof d.merchants.lat === "number" ? d.merchants.lat : null,
                  lng: typeof d.merchants.lng === "number" ? d.merchants.lng : null,
                }
              : null,
          }));
    }

    lastError = result.error;
    if (withCategory && isMissingDealCategoryColumnError(result.error)) {
      withCategory = false;
      continue;
    }
    if (withLatLng && isMissingLatLngColumnError(result.error)) {
      withLatLng = false;
      continue;
    }
    throw result.error;
  }
  throw lastError;
}

/**
 * Canonical public-visibility predicate for merchants — the single source of
 * truth mirrored from the RLS policies, the `*_public_browse` views and
 * `claim_deal`:
 *
 *   status = 'active' AND is_visible = TRUE AND is_shadow_banned = FALSE
 *
 * All three clauses are load-bearing: `is_visible` is trust-metric driven and
 * independent of shadow-ban, so dropping any clause exposes rows the database
 * treats as non-public. Shopper/public reads on base tables (service client,
 * RLS bypassed) must funnel through one of these two helpers instead of
 * hand-rolling the predicate, so the surfaces can never drift apart.
 */
// The Supabase filter builder is `.eq`-chainable and returns itself; typing
// against the full builder recursively trips "excessively deep" instantiation,
// so we narrow to just the chainable shape we use and pass the type through.
type EqChain = { eq(column: string, value: unknown): EqChain };

/**
 * Demo-row handling for the two helpers below.
 *
 * `includeDemo` defaults to FALSE everywhere, so synthetic rows are excluded
 * unless a caller opts in explicitly. A surface can only show demo data by
 * naming it at the call site — which is what makes the demo branches greppable
 * (`includeDemo:`) rather than scattered.
 *
 * The flag comes from `isDemoModeEnabled()` in lib/demo-mode.ts, which mirrors
 * the SQL `public.is_demo_mode()`. See docs/ops/demo-mode.md.
 */
export type PublicVisibilityOptions = { includeDemo?: boolean };

// The public rule itself lives in lib/merchant-visibility.ts — no I/O, so it
// can also be evaluated in memory by surfaces holding a merchant row. Both
// query builders below consume the same conditions, so a fourth condition is a
// one-line edit that reaches every form of the rule at once.
/** Restrict a `deals` query (with a `merchants!inner` join) to public merchants. */
export function withPublicMerchant<T>(
  query: T,
  opts: PublicVisibilityOptions = {}
): T {
  let chained = query as unknown as EqChain;
  for (const c of PUBLIC_MERCHANT_CONDITIONS) {
    chained = chained.eq(`merchants.${c.column}`, c.value);
  }

  // Both sides: a deal is synthetic if either it or its merchant is.
  return (
    opts.includeDemo
      ? chained
      : chained.eq("is_demo", false).eq("merchants.is_demo", false)
  ) as unknown as T;
}

/** Restrict a `merchants` base-table query to publicly-visible rows. */
export function withPublicMerchantRows<T>(
  query: T,
  opts: PublicVisibilityOptions = {}
): T {
  let chained = query as unknown as EqChain;
  for (const c of PUBLIC_MERCHANT_CONDITIONS) {
    chained = chained.eq(c.column, c.value);
  }

  return (
    opts.includeDemo ? chained : chained.eq("is_demo", false)
  ) as unknown as T;
}

/** Merchant ids the shopper has favourited (empty when signed out). */
export async function getFavouriteMerchantIds(
  userId: string | null | undefined
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!userId) return set;
  const service = createServiceClient();
  const { data } = await service
    .from("merchant_favourites")
    .select("merchant_id")
    .eq("user_id", userId);
  for (const row of data ?? []) {
    if (row.merchant_id) set.add(row.merchant_id);
  }
  return set;
}

/** Per-rail caps so flash/boosted are not crowded out of a single global limit. */
const LIVE_DEAL_FLASH_LIMIT = 20;
const LIVE_DEAL_BOOSTED_LIMIT = 20;
const LIVE_DEAL_STANDARD_LIMIT = 40;

type LiveDealBucket = "flash" | "boosted" | "standard";

async function selectLiveDealBucket(
  node: string,
  bucket: LiveDealBucket,
  limit: number,
  includeDemo: boolean
): Promise<DealRow[]> {
  const service = createServiceClient();
  const nowIso = new Date().toISOString();
  return selectDealsWithMerchants(async (select) => {
    // Wireframe 10ab / claim_deal: paused deals are hidden from the feed and
    // reject new claims. Mirror that filter here so shopper surfaces never
    // advertise a CTA the backend will refuse.
    let query = withPublicMerchant(
      service
        .from("deals")
        .select(select)
        .eq("is_active", true)
        .eq("is_paused", false)
        .gt("expires_at", nowIso),
      { includeDemo }
    ).order("created_at", { ascending: false });

    if (bucket === "flash") {
      query = query.eq("deal_type", "flash");
    } else if (bucket === "boosted") {
      query = query.eq("boost_active", true).neq("deal_type", "flash");
    } else {
      query = query.eq("deal_type", "standard").eq("boost_active", false);
    }

    query = query.limit(limit);
    if (node !== ALL_NODES) query = query.eq("node", node);
    return query;
  });
}

/**
 * `starts_at` of the active boost on each of the given deals, for the locked
 * "most recently boosted first" order.
 *
 * A separate query rather than an embedded select on purpose: `boost_flags` is a
 * one-to-many from `deals`, so embedding it would change the shape of every
 * `DealRow` and of the lat/lng-less fallback select too, for a field only the
 * boosted rail needs. The bucket is capped at LIVE_DEAL_BOOSTED_LIMIT, so this
 * is one small indexed read (`idx_boost_deal`).
 *
 * A failure here degrades rather than breaks: an empty map means the boosted
 * rail falls back to newest-first instead of the feed erroring. Losing the exact
 * order of a paid rail for one render is recoverable; a blank feed is not.
 */
async function getBoostStartTimes(dealIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (dealIds.length === 0) return map;
  const service = createServiceClient();
  const { data, error } = await service
    .from("boost_flags")
    .select("deal_id, starts_at")
    .eq("is_active", true)
    .in("deal_id", dealIds);
  if (error) {
    console.error("boost start times unavailable, boosted rail falls back:", error);
    return map;
  }
  for (const row of (data ?? []) as { deal_id: string; starts_at: string }[]) {
    // Keep the most recent flag per deal if a deal somehow carries two.
    const seen = map.get(row.deal_id);
    if (!seen || new Date(row.starts_at) > new Date(seen)) {
      map.set(row.deal_id, row.starts_at);
    }
  }
  return map;
}

/**
 * Live deals for the shopper feed, in the locked feed order.
 *
 * The three rails are ordered HERE, not in the page, because the locked order is
 * a property of the feed structure rather than of one render: it is decided once,
 * server-side, and lands in the 30s cache already ordered. The page re-sorts only
 * when the shopper explicitly picks a different sort.
 *
 * Note the ordering must happen before the `unstable_cache` boundary anyway —
 * cached values are serialized, so the `Map`s the locked orders depend on do not
 * survive the trip to the caller.
 */
async function getLiveDealsUncached(
  node: string,
  includeDemo: boolean
): Promise<{
  flash: DealRow[];
  boosted: DealRow[];
  nearMe: DealRow[];
  verifiedByMerchant: Map<string, number>;
}> {
  // Three bucket queries (not one .limit(60) then filter) so a flood of new
  // standard deals cannot starve flash/boosted rails.
  // `includeDemo` is resolved by the caller and threaded into every bucket, so
  // one feed render does one config read and all three rails agree.
  const [flash, boosted, standard] = await Promise.all([
    selectLiveDealBucket(node, "flash", LIVE_DEAL_FLASH_LIMIT, includeDemo),
    selectLiveDealBucket(node, "boosted", LIVE_DEAL_BOOSTED_LIMIT, includeDemo),
    selectLiveDealBucket(node, "standard", LIVE_DEAL_STANDARD_LIMIT, includeDemo),
  ]);

  const merchantIds = [
    ...flash.map((d) => d.merchant_id),
    ...boosted.map((d) => d.merchant_id),
    ...standard.map((d) => d.merchant_id),
  ];
  const [verifiedByMerchant, boostStartedAt] = await Promise.all([
    getVerifiedCounts(merchantIds),
    getBoostStartTimes(boosted.map((d) => d.id)),
  ]);

  // The frozen feed structure (Notion "Frozen Scope & Rules"): flash by soonest
  // expiry, boosted by most recently boosted, standard by all-time verified
  // redemptions descending.
  return {
    flash: lockedFlashOrder(flash),
    boosted: lockedBoostedOrder(boosted, boostStartedAt),
    nearMe: lockedStandardOrder(standard, verifiedByMerchant),
    verifiedByMerchant,
  };
}

/** Short-lived cache for hot Feed/Browse reads (30s per node). */
export type LiveDealsResult = {
  flash: DealRow[];
  boosted: DealRow[];
  nearMe: DealRow[];
  verifiedByMerchant: Map<string, number>;
};

export async function getLiveDeals(node: string): Promise<LiveDealsResult> {
  // Resolved OUTSIDE the cached function on purpose. Inside, the flag would be
  // baked into the cache entry and a demo-mode toggle would keep serving the
  // old answer for up to 30s — long enough to show synthetic deals after
  // switching to launch mode. It is also part of the cache key, so the demo and
  // launch feeds are separate entries rather than one that overwrites the other.
  const includeDemo = await isDemoModeEnabled();
  const mode = includeDemo ? "demo" : "real";
  return unstable_cache(
    () => getLiveDealsUncached(node, includeDemo),
    ["live-deals", node, mode],
    { revalidate: 30, tags: [`live-deals-${node}`] }
  )();
}

/** Request-scoped reader for the three cached shopper discovery surfaces. */
export async function getShopperLiveDeals(
  node: string
): Promise<LiveDealsResult> {
  // A polling refresh carries a short-lived, server-issued cookie. That one
  // read must observe current inventory rather than Next's stale cache entry;
  // ordinary navigation still benefits from the hot per-node cache.
  if (
    shouldBypassLiveDealsCache(
      cookies().get(SHOPPER_INVENTORY_BYPASS_COOKIE)?.value
    )
  ) {
    const includeDemo = await isDemoModeEnabled();
    return getLiveDealsUncached(node, includeDemo);
  }
  return getLiveDeals(node);
}

/** Verified (status=success) redemption counts per merchant. */
export async function getVerifiedCounts(
  merchantIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = Array.from(new Set(merchantIds)).filter(Boolean);
  if (ids.length === 0) return map;
  const service = createServiceClient();
  // SQL GROUP BY via RPC — never pull raw redemption rows (PostgREST silently
  // caps at 1000 rows, which under-counts verified badges and feed ranking).
  const { data, error } = await service.rpc("verified_counts_by_merchant", {
    p_merchant_ids: ids,
  });
  if (error) throw error;
  for (const row of data ?? []) {
    const merchantId = row.merchant_id as string;
    const count = Number(row.verified_count);
    if (merchantId && Number.isFinite(count)) map.set(merchantId, count);
  }
  return map;
}

export async function getDeal(dealId: string): Promise<DealRow | null> {
  const service = createServiceClient();
  // Public detail surface: a deal is only reachable when its merchant is
  // publicly visible. This gates MERCHANT visibility only, matching claim_deal's
  // merchant_not_available check — it does NOT mean everything reachable here is
  // claimable. Deal-level state (expired / fully-claimed / paused) is surfaced by
  // the page itself, which renders "Fully claimed" and disables claiming. A fully
  // claimed deal is legitimate discovery and history content; see "Discoverable
  // is not claimable" in CLAUDE.md before adding an eligibility filter here.
  const includeDemo = await isDemoModeEnabled();
  const rows = await selectDealsWithMerchants((select) =>
    withPublicMerchant(service.from("deals").select(select).eq("id", dealId), {
      includeDemo,
    }).maybeSingle()
  );
  return rows[0] ?? null;
}
