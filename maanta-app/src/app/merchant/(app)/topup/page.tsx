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
  const { merchant, permissions } = res.ctx;

  if (!permissions.can_topup) {
    return (
      <main className="px-6 py-24 text-center">
        <p className="text-sm font-semibold text-ink">
          You don&apos;t have permission to top up the wallet.
        </p>
        <p className="mt-1 text-xs text-muted">Ask the shop owner to enable it in Staff.</p>
      </main>
    );
  }

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
