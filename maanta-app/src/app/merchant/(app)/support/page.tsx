import { getSuccessFee } from "@/lib/data";
import { ButtonLink } from "@/components/ui/button";
import { IconWhatsApp } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

/** 10k Merchant support / help. */
function faqs(fee: number) {
  return [
    {
      q: "How is the success fee charged?",
      a: `KES ${fee.toLocaleString("en-KE")} is deducted from your wallet the moment you verify a customer's code at the counter. Expired or rejected codes are never charged.`,
    },
    {
      q: "My redemption was rejected — why?",
      a: "Codes are rejected when they've expired past the 15-minute grace period, were already used, or you chose Reject on a location-mismatch warning. No fee is charged for rejected codes.",
    },
  ];
}

export default async function MerchantSupportPage() {
  const FAQS = faqs(await getSuccessFee());
  return (
    <main className="px-4 pt-5">
      <h1 className="text-center text-lg font-bold text-ink">Support</h1>
      <div className="mt-6 space-y-3">
        {FAQS.map((f) => (
          <details key={f.q} className="rounded-card border border-line bg-white px-4 py-3.5">
            <summary className="cursor-pointer text-sm font-semibold text-ink">{f.q}</summary>
            <p className="mt-2 text-sm text-muted">{f.a}</p>
          </details>
        ))}
      </div>
      <ButtonLink
        href="https://wa.me/254700000000"
        variant="secondary"
        full
        className="mt-8"
        target="_blank"
        rel="noopener noreferrer"
      >
        <IconWhatsApp className="h-5 w-5" />
        Chat on WhatsApp
      </ButtonLink>
    </main>
  );
}
