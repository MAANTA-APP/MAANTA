import { FACTS } from "@/lib/marketing/facts";
import { ENTITY } from "@/lib/marketing/demo";
import { ButtonLink } from "@/components/ui/button";
import { IconWhatsApp } from "@/components/ui/icons";

/**
 * Shared help content, rendered in both shells.
 *
 * `/help` renders it in the marketing shell so a visitor arriving from the
 * footer or `/download` is not dropped into the app tab bar mid-journey — risk
 * R9, resolved by founder ruling 2026-07-31. `/you/help` renders the same
 * content inside the app shell, where a signed-in shopper expects to stay.
 *
 * One source, two shells: the alternative was two copies of the same answers,
 * which is how `/faq` and `/help` drift apart.
 *
 * Numbers read from `facts.ts`. This content previously hardcoded "6-digit" and
 * "15 minutes" as prose, which made it the last surface outside the marketing
 * pages still typing a frozen number.
 */
const FAQS = [
  {
    q: "How do I redeem a deal?",
    a: `Claim the deal to get a ${FACTS.codeLength}-digit code, then show it to shop staff at the counter before it expires.`,
  },
  {
    q: "What is a grace period?",
    a: `Your code stays valid for ${FACTS.graceMinutes} minutes after the deal ends, so you have time to reach the counter.`,
  },
  {
    q: "What does it cost me?",
    a: "Nothing. There is no payment of any kind inside MAANTA — you pay the shop at the till, the way you normally would.",
  },
  {
    q: "The code did not work. What now?",
    a: "You are not charged either way. Message us on WhatsApp with the code and the shop, and we will look at what the shop published.",
  },
];

export function HelpFaqs() {
  return (
    <div className="space-y-3">
      {FAQS.map((f) => (
        <details
          key={f.q}
          className="rounded-card bg-white px-4 py-3.5 shadow-card"
        >
          <summary className="cursor-pointer text-sm font-semibold text-ink">{f.q}</summary>
          <p className="mt-2 text-sm text-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/** The real support line, from one constant. Never a hardcoded number (drift D36). */
export function HelpWhatsAppButton({ className = "" }: { className?: string }) {
  return (
    <ButtonLink
      href={ENTITY.whatsappLink}
      variant="secondary"
      full
      className={className}
      target="_blank"
      rel="noopener noreferrer"
    >
      <IconWhatsApp className="h-5 w-5" />
      Chat on WhatsApp
    </ButtonLink>
  );
}
