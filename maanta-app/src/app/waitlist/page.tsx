import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import WaitlistForm from "./waitlist-form";

export const metadata: Metadata = {
  title: "MAANTA — Join the shopper waitlist",
  description:
    "MAANTA launches at BBS Mall, Nairobi this November. Join the waitlist to claim real in-mall deals from day one.",
};

export default function ShopperWaitlistPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">The mall, made live.</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          MAANTA launches at BBS Mall, Nairobi this November. Browse real
          deals from real shops, claim a code on your phone, redeem in
          person. Join the waitlist for day-one access.
        </p>
      </div>
      <Suspense>
        <WaitlistForm segment="shopper" />
      </Suspense>
      <p className="text-center text-xs text-black/40 dark:text-white/40">
        Run a shop? <Link href="/merchants" className="underline">Join the merchant launch list</Link>
        {" · "}
        <Link href="/mall-operators" className="underline">For mall operators</Link>
      </p>
    </main>
  );
}
