import { redirect } from "next/navigation";
import { getMerchantContext } from "@/lib/merchant";
import { ButtonLink } from "@/components/ui/button";
import { Logomark } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

/** 9a Merchant landing / intro. Existing merchants go straight to the keypad. */
export default async function MerchantLandingPage() {
  const res = await getMerchantContext();
  if (res.status === "ok") redirect("/merchant/redeem");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col px-6 pb-10 pt-14">
      <Logomark className="h-10 w-10" />
      <h1 className="mt-6 text-3xl font-bold leading-tight text-ink">
        List your shop on Maanta
      </h1>
      <p className="mt-3 text-sm text-muted">
        Publish deals, get discovered, pay only for verified redemptions
      </p>
      <div className="mt-8 flex h-56 items-center justify-center rounded-2xl border-2 border-dashed border-ink/20 bg-cream text-xs text-faint">
        value prop illustration
      </div>
      <div className="mt-auto pt-10">
        <ButtonLink
          href={res.status === "signed-out" ? "/login?next=/merchant/onboard" : "/merchant/onboard"}
          full
        >
          Get started
        </ButtonLink>
      </div>
    </main>
  );
}
