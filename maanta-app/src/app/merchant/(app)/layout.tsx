import { redirect } from "next/navigation";
import { getMerchantContext } from "@/lib/merchant";
import { MerchantTopBar } from "@/components/nav/merchant-top-bar";
import { MerchantBottomBar } from "@/components/nav/bottom-bars";
import { OfflineBanner } from "@/components/ui/states";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import { MerchantLifecycleBanner } from "@/components/merchant/merchant-lifecycle-banner";
import { getSuccessFee } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/service";

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

  const service = createServiceClient();
  const { data: deals } = await service
    .from("deals")
    .select("expires_at, is_active")
    .eq("merchant_id", merchant.id);

  // The app shell is SCREEN chrome and is hidden from print (Codex P2 on PR
  // #279). /merchant/qr/print produces a sheet that goes on a public wall, and
  // this layout would otherwise put the merchant's WALLET BALANCE (top bar),
  // the demo/offline/lifecycle banners and the fixed bottom navigation on it —
  // the balance being the one genuinely sensitive thing here. Print rules only:
  // nothing below changes a single on-screen pixel, and no merchant page has
  // ever wanted the bottom nav on paper.
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col border-x border-line bg-white lg:max-w-3xl print:max-w-none print:border-0 print:min-h-0">
      <div className="print:hidden">
        <DemoModeBanner />
        <OfflineBanner context="merchant" />
        <MerchantTopBar
          merchantName={merchant.merchant_name}
          balance={merchant.account_balance}
          lowThreshold={lowThreshold}
        />
        <MerchantLifecycleBanner merchant={merchant} deals={deals ?? []} />
      </div>
      <div className="flex-1 pb-24 print:pb-0">{children}</div>
      <div className="print:hidden">
        <MerchantBottomBar />
      </div>
    </div>
  );
}
