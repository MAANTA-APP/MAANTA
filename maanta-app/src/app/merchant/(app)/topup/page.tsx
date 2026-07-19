import { redirect } from "next/navigation";
import { getMerchantContext } from "@/lib/merchant";
import { TopupFlow } from "./topup-flow";

export const dynamic = "force-dynamic";

/** 9i Wallet top-up + 10s success / 10t failed. */
export default async function TopupPage({
  searchParams,
}: {
  searchParams: { suggested?: string; stripe?: string };
}) {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  // Top-up is owner-only (billing). Staff never see the wallet/top-up surface —
  // the POST routes enforce this too; the redirect just keeps the UI honest.
  if (!res.ctx.isOwner) redirect("/merchant/redeem");
  const { merchant } = res.ctx;

  const suggested = parseInt(searchParams.suggested ?? "", 10);

  return (
    <TopupFlow
      balance={merchant.account_balance}
      merchantPhone={merchant.phone}
      initialAmount={isNaN(suggested) ? 3000 : suggested}
      stripeResult={searchParams.stripe ?? null}
    />
  );
}
