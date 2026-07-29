import { getMerchantContext } from "@/lib/merchant";
import { getSuccessFee } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/service";
import { getDealLimitState } from "@/lib/deal-limits";
import { NewDealWizard } from "./new-deal-wizard";

export const dynamic = "force-dynamic";

/** 9n–9s Create deal. */
export default async function NewDealPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, permissions } = res.ctx;
  const fee = await getSuccessFee();

  // Count exactly what `enforce_deal_limit` counts (every is_active row, no
  // expiry filter) so the wizard blocks on the same condition the DB will.
  const service = createServiceClient();
  const { count: activeCount } = await service
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchant.id)
    .eq("is_active", true);

  const limitState = getDealLimitState(merchant.tier, activeCount ?? 0);

  return (
    <NewDealWizard
      tier={merchant.tier}
      fee={fee}
      canDeals={permissions.can_deals}
      canPurchase={permissions.can_purchase}
      balance={merchant.account_balance}
      limitState={limitState}
    />
  );
}
