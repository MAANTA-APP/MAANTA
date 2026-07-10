import { getMerchantContext } from "@/lib/merchant";
import { getSuccessFee } from "@/lib/data";
import { NewDealWizard } from "./new-deal-wizard";

export const dynamic = "force-dynamic";

/** 9n–9s Create deal. */
export default async function NewDealPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, permissions } = res.ctx;
  const fee = await getSuccessFee();

  return (
    <NewDealWizard
      tier={merchant.tier}
      fee={fee}
      canDeals={permissions.can_deals}
    />
  );
}
