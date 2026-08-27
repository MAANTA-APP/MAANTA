import { getMerchantContext } from "@/lib/merchant";
import { getSuccessFee } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/service";
import { RedeemKeypad } from "./redeem-keypad";
import { QueuePanel } from "./queue-panel";
import {
  RecentVerifications,
  type RecentVerification,
} from "@/components/merchant/recent-verifications";
import { staffFacingName } from "@/lib/queue";

export const dynamic = "force-dynamic";

/** How many past verifications the till shows. Enough to answer "did that one
 *  go through?", short enough not to push the keypad off a small screen. */
const RECENT_VERIFICATION_COUNT = 3;

/** 9k Redemption keypad (merchant home) + 9l/9m/9t/10l/10m states. */
export default async function MerchantRedeemPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null; // layout guards
  const { merchant, permissions } = res.ctx;
  const fee = await getSuccessFee();

  const service = createServiceClient();

  // Both reads are scoped by merchant_id from the AUTHENTICATED context — the
  // service client bypasses RLS, so this predicate is the tenant boundary,
  // exactly as in the queue route and the redemption preflight.
  const [{ count: pausedCount }, recentRes] = await Promise.all([
    service
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchant.id)
      .eq("is_active", true)
      .eq("is_paused", true),
    // The last few verified redemptions at this till (G1). Read-only, and
    // identity-minimised below to first name + last initial.
    service
      .from("redemptions")
      .select("id, redeemed_at, users(full_name), deals(title)")
      .eq("merchant_id", merchant.id)
      .eq("status", "success")
      .order("redeemed_at", { ascending: false })
      .limit(RECENT_VERIFICATION_COUNT),
  ]);

  type RecentRow = {
    id: string;
    redeemed_at: string | null;
    users: { full_name: string | null } | null;
    deals: { title: string } | null;
  };

  // A failed read is passed through as a failure, never flattened to an empty
  // list (D164/D185): "nothing verified recently" and "we could not look" are
  // different sentences at a counter.
  const recentFailed = Boolean(recentRes.error);
  const recent: RecentVerification[] = ((recentRes.data ?? []) as unknown as RecentRow[])
    .filter((r) => r.redeemed_at !== null)
    .map((r) => ({
      id: r.id,
      name: staffFacingName(r.users?.full_name),
      dealTitle: r.deals?.title ?? "Deal",
      verifiedAt: r.redeemed_at as string,
    }));

  return (
    <div>
      {(pausedCount ?? 0) > 0 ? (
        <p className="border-b border-line bg-cream px-4 py-2.5 text-xs text-muted">
          Paused for new claims; existing claimed tickets remain redeemable until
          expiry.
        </p>
      ) : null}
      {permissions.can_verify ? <QueuePanel /> : null}
      <RedeemKeypad
        balance={merchant.account_balance}
        fee={fee}
        canVerify={permissions.can_verify}
      />
      {permissions.can_verify ? (
        <RecentVerifications items={recent} readFailed={recentFailed} />
      ) : null}
    </div>
  );
}
