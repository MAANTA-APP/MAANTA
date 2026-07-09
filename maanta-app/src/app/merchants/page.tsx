import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import WaitlistForm from "../waitlist/waitlist-form";

export const metadata: Metadata = {
  title: "MAANTA — Merchants: join the launch list",
  description:
    "Turn mall footfall into verified redemptions. Only pay when a customer shows up — KES 30 per verified redemption. Launching at BBS Mall this November.",
};

export default function MerchantWaitlistPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          Turn footfall into verified sales visits.
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          MAANTA sends shoppers to your shop and you only pay when a deal is
          redeemed at your counter — KES 30 per verified redemption, nothing
          otherwise. Launch merchants get a 30-day Elite trial. Launching at
          BBS Mall this November.
        </p>
      </div>
      <Suspense>
        <WaitlistForm segment="merchant" />
      </Suspense>
      <p className="text-center text-xs text-black/40 dark:text-white/40">
        Shopping instead? <Link href="/waitlist" className="underline">Join the shopper waitlist</Link>
        {" · "}
        <Link href="/mall-operators" className="underline">For mall operators</Link>
      </p>
    </main>
  );
}
