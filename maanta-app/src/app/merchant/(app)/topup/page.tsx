import { getMerchantContext } from "@/lib/merchant";
import { canUseMerchantSurface } from "@/lib/merchant-nav";
import { isMpesaTopupConfigured } from "@/lib/intasend";
import { MerchantPermissionDenied } from "@/components/merchant/permission-denied";
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
  const { merchant, permissions } = res.ctx;

  // /api/topup and /api/topup/stripe both require `can_topup`, so rendering the
  // amount picker for staff without it is a dead end — say so instead.
  if (!canUseMerchantSurface("topup", permissions)) {
    return <MerchantPermissionDenied action="top up the wallet" />;
  }

  const suggested = parseInt(searchParams.suggested ?? "", 10);

  return (
    <TopupFlow
      balance={merchant.account_balance}
      merchantPhone={merchant.phone}
      initialAmount={isNaN(suggested) ? 3000 : suggested}
      stripeResult={searchParams.stripe ?? null}
      // Phase 1 reality: card (Stripe) is the shipped rail; M-Pesa appears only
      // where IntaSend credentials actually exist.
      mpesaEnabled={isMpesaTopupConfigured()}
    />
  );
}
