import { ButtonLink } from "@/components/ui/button";
import { IconWhatsApp } from "@/components/ui/icons";

/** 8r Help / support — FAQ rows + WhatsApp CTA. */
const FAQS = [
  {
    q: "How do I redeem a deal?",
    a: "Claim the deal to get a 6-digit code, then show it to shop staff at the counter before it expires.",
  },
  {
    q: "What is a grace period?",
    a: "Your code stays valid for 15 minutes after the deal ends, so you have time to reach the counter.",
  },
];

export default function HelpPage() {
  return (
    <main className="px-4 pt-6">
      <h1 className="text-center text-lg font-bold text-ink">Help</h1>
      <div className="mt-6 space-y-3">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="rounded-card border border-line bg-white px-4 py-3.5"
          >
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {f.q}
            </summary>
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
