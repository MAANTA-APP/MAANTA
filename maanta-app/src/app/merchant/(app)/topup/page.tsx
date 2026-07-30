import { getMerchantContext } from "@/lib/merchant";
import { isIntasendConfigured } from "@/lib/intasend";
import { TopupFlow } from "./topup-flow";

export const dynamic = "force-dynamic";

/** Wallet top-up — Stripe Checkout is Phase 1; STK only when IntaSend is set. */
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
      mpesaAvailable={isIntasendConfigured()}
    />
  );
}
