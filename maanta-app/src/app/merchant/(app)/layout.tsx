import { redirect } from "next/navigation";
import { getMerchantContext } from "@/lib/merchant";
import { MerchantTopBar } from "@/components/nav/merchant-top-bar";
import { MerchantBottomBar } from "@/components/nav/bottom-bars";
import { OfflineBanner } from "@/components/ui/states";
import { getSuccessFee } from "@/lib/data";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MerchantAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const res = await getMerchantContext();
  if (res.status === "signed-out") redirect("/login?next=/merchant/redeem");
  if (res.status === "no-merchant") redirect("/merchant");

  const { merchant } = res.ctx;
  const fee = await getSuccessFee();
  const lowThreshold = fee * 3;

  return (
    // Phone: single column (max-w-mobile). Tablet-at-the-till (lg+): the frame
    // widens so redeem can split into two panes (§8.8). Single-pane pages
    // self-cap at ~560px; redeem uses the full width.
    <div className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col border-x border-line bg-white lg:max-w-3xl">
      <OfflineBanner />
      <MerchantTopBar
        merchantName={merchant.merchant_name}
        balance={merchant.account_balance}
        lowThreshold={lowThreshold}
      />
      {merchant.status !== "active" ? (
        <div className="border-b border-line bg-cream px-4 py-2.5 text-xs font-semibold text-ink">
          {merchant.status === "pending" ? (
            <>Your shop is pending approval — we&apos;ll notify you within 24 hours.</>
          ) : (
            <>
              Your shop is {merchant.status}.{" "}
              <Link href="/merchant/support" className="underline">
                Contact support
              </Link>
            </>
          )}
        </div>
      ) : null}
      <div className="flex-1 pb-24">{children}</div>
      <MerchantBottomBar />
    </div>
  );
}
