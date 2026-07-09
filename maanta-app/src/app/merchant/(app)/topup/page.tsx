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
