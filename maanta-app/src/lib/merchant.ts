import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser, getMerchantForUser, type AppUser, type MerchantRow } from "@/lib/data";

export type StaffPermissions = {
  can_verify: boolean;
  can_deals: boolean;
  can_topup: boolean;
  can_purchase: boolean;
};

export type MerchantContext = {
  user: AppUser;
  merchant: MerchantRow;
  isOwner: boolean;
  permissions: StaffPermissions;
};

const OWNER_PERMISSIONS: StaffPermissions = {
  can_verify: true,
  can_deals: true,
  can_topup: true,
  can_purchase: true,
};

/**
 * Resolve the signed-in user's merchant context: owner (merchants.user_id)
 * or invited staff (merchant_staff.user_id / phone match).
 */
export async function getMerchantContext(): Promise<
  | { status: "signed-out" }
  | { status: "no-merchant"; user: AppUser }
  | { status: "ok"; ctx: MerchantContext }
> {
  const user = await getAppUser();
  if (!user) return { status: "signed-out" };

  const owned = await getMerchantForUser(user.id);
  if (owned) {
    return {
      status: "ok",
      ctx: { user, merchant: owned, isOwner: true, permissions: OWNER_PERMISSIONS },
    };
  }

  // Staff: match by linked user_id first, then by phone (first sign-in links it).
  const service = createServiceClient();
  let { data: staff } = await service
    .from("merchant_staff")
    .select("id, merchant_id, user_id, can_verify, can_deals, can_topup, can_purchase")
    .eq("user_id", user.id)
    .maybeSingle();

  // Linking a pre-invited seat by phone is an access-control decision, so it must
  // trust only a phone the user has proven they control. `user.phone` is safe to
  // match on because it is a Clerk-VERIFIED number by construction: every write to
  // it goes through `verifiedPrimaryPhone` (src/lib/auth.ts) — at provisioning, and
  // since D129 also as a NULL-only backfill on a later sign-in, which is what makes
  // this branch reachable for an email-first signup at all — and it is immutable to
  // the holder thereafter (D124 trigger). Both halves are load-bearing — do not
  // match staff on a column that could hold an unverified value, and do not add a
  // second writer that skips `verifiedPrimaryPhone`.
  if (!staff && user.phone) {
    const { data: byPhone } = await service
      .from("merchant_staff")
      .select("id, merchant_id, user_id, can_verify, can_deals, can_topup, can_purchase")
      .eq("phone", user.phone)
      .is("user_id", null)
      .maybeSingle();
    if (byPhone) {
      // Link on first sign-in (wireframe 10aa: "Permissions apply from first sign-in").
      await service
        .from("merchant_staff")
        .update({ user_id: user.id })
        .eq("id", byPhone.id);
      if (user.role === "customer") {
        await service.from("users").update({ role: "merchant_staff" }).eq("id", user.id);
      }
      staff = { ...byPhone, user_id: user.id };
    }
  }

  if (staff) {
    const { data: merchant } = await service
      .from("merchants")
      .select(
        "id, user_id, merchant_name, tier, status, elite_trial_active, trial_ends_at, grace_period_ends_at, node, what3words_address, mall_name, floor, unit_number, phone, email, whatsapp, account_balance, outstanding_arrears, onboarded_at"
      )
      .eq("id", staff.merchant_id)
      .maybeSingle();
    if (merchant) {
      return {
        status: "ok",
        ctx: {
          user,
          merchant: merchant as MerchantRow,
          isOwner: false,
          permissions: {
            can_verify: staff.can_verify,
            can_deals: staff.can_deals,
            can_topup: staff.can_topup,
            can_purchase: staff.can_purchase,
          },
        },
      };
    }
  }

  return { status: "no-merchant", user };
}

/** Clear boost_active on deals whose boost window has lapsed (lazy maintenance). */
export async function expireStaleBoosts(merchantId: string) {
  const service = createServiceClient();
  const { data: activeFlags } = await service
    .from("boost_flags")
    .select("deal_id")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .gt("ends_at", new Date().toISOString());
  const stillBoosted = new Set((activeFlags ?? []).map((f) => f.deal_id));

  const { data: flaggedDeals } = await service
    .from("deals")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("boost_active", true);
  const stale = (flaggedDeals ?? []).filter((d) => !stillBoosted.has(d.id));
  if (stale.length > 0) {
    await service
      .from("deals")
      .update({ boost_active: false })
      .in(
        "id",
        stale.map((d) => d.id)
      );
    await service
      .from("boost_flags")
      .update({ is_active: false })
      .eq("merchant_id", merchantId)
      .lte("ends_at", new Date().toISOString())
      .eq("is_active", true);
  }
}

/** Verified redemptions + fee totals for KPI displays. */
export async function getMerchantStats(merchantId: string) {
  const service = createServiceClient();
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();

  const [{ count: today }, { count: week }, { count: allTime }] = await Promise.all([
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .eq("status", "success")
      .gte("redeemed_at", dayStart),
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .eq("status", "success")
      .gte("redeemed_at", weekStart),
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .eq("status", "success"),
  ]);

  return { today: today ?? 0, week: week ?? 0, allTime: allTime ?? 0 };
}
