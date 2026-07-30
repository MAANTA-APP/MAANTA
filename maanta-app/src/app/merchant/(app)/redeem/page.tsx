import { getMerchantContext } from "@/lib/merchant";
import { getSuccessFee } from "@/lib/data";
import { StaffVerifyGate } from "@/components/merchant/staff-verify-gate";
import { RedeemKeypad } from "./redeem-keypad";

export const dynamic = "force-dynamic";

/** 9k Redemption keypad (merchant home) + 9l/9m/9t/10l/10m states. */
export default async function MerchantRedeemPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null; // layout guards
  const { merchant, permissions } = res.ctx;

  // Frame 13j (R-VERIFY-PERMISSION): staff without verify permission get the
  // gate screen with a route to the owner, not the keypad.
  if (!permissions.can_verify) {
    return <StaffVerifyGate ownerPhone={merchant.phone} shopName={merchant.merchant_name} />;
  }

  const fee = await getSuccessFee();

  return (
    <RedeemKeypad
      balance={merchant.account_balance}
      fee={fee}
      canVerify={permissions.can_verify}
    />
  );
}
