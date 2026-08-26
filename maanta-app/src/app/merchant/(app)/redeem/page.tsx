import { getMerchantContext } from "@/lib/merchant";
import { getSuccessFee } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/service";
import { RedeemKeypad } from "./redeem-keypad";
import { QueuePanel } from "./queue-panel";

export const dynamic = "force-dynamic";

/** 9k Redemption keypad (merchant home) + 9l/9m/9t/10l/10m states. */
export default async function MerchantRedeemPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null; // layout guards
  const { merchant, permissions } = res.ctx;
  const fee = await getSuccessFee();

  const service = createServiceClient();
  const { count: pausedCount } = await service
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchant.id)
    .eq("is_active", true)
    .eq("is_paused", true);

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
    </div>
  );
}
