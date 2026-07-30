import { getMerchantContext } from "@/lib/merchant";
import { getSuccessFee } from "@/lib/data";
import { RedeemKeypad } from "./redeem-keypad";

export const dynamic = "force-dynamic";

/** 9k Redemption keypad (merchant home) + 9l/9m/9t/10l/10m states. */
export default async function MerchantRedeemPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null; // layout guards
  const { merchant, permissions } = res.ctx;
  const fee = await getSuccessFee();

  return (
    <RedeemKeypad
      balance={merchant.account_balance}
      fee={fee}
      canVerify={permissions.can_verify}
      shopName={merchant.merchant_name}
      ownerPhone={merchant.phone}
    />
  );
}
