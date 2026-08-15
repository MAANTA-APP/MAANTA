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

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col border-x border-line bg-white lg:max-w-3xl">
      <DemoModeBanner />
      <OfflineBanner context="merchant" />
      <MerchantTopBar
        merchantName={merchant.merchant_name}
        balance={merchant.account_balance}
        lowThreshold={lowThreshold}
      />
      <MerchantLifecycleBanner merchant={merchant} deals={deals ?? []} />
      <div className="flex-1 pb-24">{children}</div>
      <MerchantBottomBar />
    </div>
  );
}
