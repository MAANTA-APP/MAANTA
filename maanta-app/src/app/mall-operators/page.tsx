import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import WaitlistForm from "../waitlist/waitlist-form";

export const metadata: Metadata = {
  title: "MAANTA — For mall operators",
  description:
    "Activate your tenants, improve visibility, and get mall-level insight from verified in-person redemptions. MAANTA launches at BBS Mall, Nairobi this November.",
};

export default function MallOperatorWaitlistPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          Activate your tenants. See your mall&apos;s data.
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          MAANTA gives every tenant a way to convert footfall into measured
          sales visits — with on-ground activation done for you and
          mall-level insight from verified redemptions. We launch at BBS
          Mall this November; register interest to talk pilots and rollout.
        </p>
      </div>
      <Suspense>
        <WaitlistForm segment="mall_operator" />
      </Suspense>
      <p className="text-center text-xs text-black/40 dark:text-white/40">
        <Link href="/waitlist" className="underline">Shopper waitlist</Link>
        {" · "}
        <Link href="/merchants" className="underline">Merchant launch list</Link>
      </p>
    </main>
  );
}
