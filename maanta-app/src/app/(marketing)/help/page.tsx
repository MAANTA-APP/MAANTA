import type { Metadata } from "next";
import Link from "next/link";
import { HelpFaqs, HelpWhatsAppButton } from "@/components/marketing/help-content";
import { Section, SectionHeading } from "@/components/marketing/sections";
import { pageMetadata } from "@/lib/marketing/page-metadata";

/**
 * `/help` in the marketing shell — risk R9, resolved 2026-07-31.
 *
 * This page previously rendered inside the app shell (Feed/Browse/Map/Deals/You
 * tab bar), so a visitor arriving from the footer or `/download` was dropped into
 * product chrome mid-journey. The footer plan offered two fixes and said not to
 * ship the jarring version; the interim was pointing the footer at `/faq`.
 * The content now lives in one component and renders in both shells —
 * `/you/help` keeps the app-shell version for signed-in shoppers.
 */

export const metadata: Metadata = pageMetadata({
  path: "/help",
  title: "Help — MAANTA",
  description:
    "How to claim and redeem a MAANTA deal, what the grace period is, and how to reach support.",
});

export default function HelpPage() {
  return (
    <Section>
      <SectionHeading lead="Answers to the things shoppers ask most, and a line straight to support.">
        Help
      </SectionHeading>
      <div className="mt-8 max-w-2xl">
        <HelpFaqs />
        <HelpWhatsAppButton className="mt-6" />
        <p className="mt-6 text-sm text-secondary">
          Running a shop? See{" "}
          <Link href="/merchants" className="underline underline-offset-4 hover:text-ink">
            merchant help
          </Link>
          , or the full{" "}
          <Link href="/faq" className="underline underline-offset-4 hover:text-ink">
            FAQ
          </Link>
          .
        </p>
      </div>
    </Section>
  );
}
