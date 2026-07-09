import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ALL_NODES, DEFAULT_NODE, NODE_COOKIE, NODES } from "@/lib/nodes";

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
  auth_uid: string;
  phone: string | null;
  email: string | null;
  full_name: string | null;
  role: "customer" | "merchant_admin" | "merchant_staff" | "agent" | "admin";
};

/** Auth user + matching public.users row (null when signed out). */
export async function getAppUser(): Promise<AppUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("users")
    .select("id, auth_uid, phone, email, full_name, role")
    .eq("auth_uid", user.id)
    .maybeSingle();
  return (data as AppUser) ?? null;
}

export type MerchantRow = {
  id: string;
  user_id: string;
  merchant_name: string;
  tier: "standard" | "elite";
  status: string;
  elite_trial_active: boolean;
  trial_ends_at: string | null;
  node: string;
  what3words_address: string;
  mall_name: string | null;
  floor: string | null;
  unit_number: string | null;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  account_balance: number;
  outstanding_arrears: number;
};

/** The merchant owned by (or staffed by) this app user, if any. */
export async function getMerchantForUser(userId: string): Promise<MerchantRow | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("merchants")
    .select(
      "id, user_id, merchant_name, tier, status, elite_trial_active, trial_ends_at, node, what3words_address, mall_name, floor, unit_number, phone, email, whatsapp, account_balance, outstanding_arrears"
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
  return isNaN(n) ? 30 : n;
}

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
  flash_duration_hours: number;
  is_active: boolean;
  max_claims: number | null;
  claims_count: number;
  success_fee: number;
  boost_active: boolean;
  starts_at: string;
  expires_at: string | null;
  merchants: {
    id: string;
    merchant_name: string;
    floor: string | null;
    unit_number: string | null;
    what3words_address: string;
    mall_name: string | null;
    node: string;
  } | null;
};

const DEAL_SELECT =
  "id, merchant_id, node, title, description, image_url, deal_type, flash_duration_hours, is_active, max_claims, claims_count, success_fee, boost_active, starts_at, expires_at, merchants!inner(id, merchant_name, floor, unit_number, what3words_address, mall_name, node, is_visible, is_shadow_banned, status)";

/** Live deals for the shopper feed, ranked by verified redemptions within groups. */
export async function getLiveDeals(node: string): Promise<{
  flash: DealRow[];
  boosted: DealRow[];
  nearMe: DealRow[];
  verifiedByMerchant: Map<string, number>;
}> {
  const service = createServiceClient();
  let query = service
    .from("deals")
    .select(DEAL_SELECT)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .eq("merchants.is_visible", true)
    .eq("merchants.is_shadow_banned", false)
    .eq("merchants.status", "active")
    .order("created_at", { ascending: false })
    .limit(60);
  if (node !== ALL_NODES) query = query.eq("node", node);
  const { data } = await query;
  const deals = ((data ?? []) as unknown as DealRow[]).filter((d) => d.merchants);

  const verifiedByMerchant = await getVerifiedCounts(deals.map((d) => d.merchant_id));

  const flash = deals.filter((d) => d.deal_type === "flash");
  const boosted = deals.filter((d) => d.boost_active && d.deal_type !== "flash");
  const nearMe = deals
    .filter((d) => !d.boost_active && d.deal_type !== "flash")
    .sort(
      (a, b) =>
        (verifiedByMerchant.get(b.merchant_id) ?? 0) -
        (verifiedByMerchant.get(a.merchant_id) ?? 0)
    );
  return { flash, boosted, nearMe, verifiedByMerchant };
}

/** Verified (status=success) redemption counts per merchant. */
export async function getVerifiedCounts(
  merchantIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = Array.from(new Set(merchantIds)).filter(Boolean);
  if (ids.length === 0) return map;
  const service = createServiceClient();
  const { data } = await service
    .from("redemptions")
    .select("merchant_id")
    .in("merchant_id", ids)
    .eq("status", "success");
  for (const r of data ?? []) {
    map.set(r.merchant_id, (map.get(r.merchant_id) ?? 0) + 1);
  }
  return map;
}

export async function getDeal(dealId: string): Promise<DealRow | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("deals")
    .select(DEAL_SELECT)
    .eq("id", dealId)
    .maybeSingle();
  return (data as unknown as DealRow) ?? null;
}
