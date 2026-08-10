import type { Metadata } from "next";
import Link from "next/link";
import { HelpFaqs, HelpWhatsAppButton } from "@/components/marketing/help-content";
import { Section } from "@/components/marketing/sections";
import { RESPONSE_TIMES } from "@/lib/marketing/facts";
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
  // Was 90 characters. The support commitment is the part a searcher is
  // deciding on, so it belongs in the snippet.
  description:
    // 160 chars. This description was extended into the snippet window by the
    // 2026-08-10 audit pass and overshot it at 162; the gate now holds the line.
    "How to claim and redeem a MAANTA deal, what the grace period is, and how to reach a person. We reply the same day on WhatsApp, next business day by email.",
});

export default function HelpPage() {
  return (
    <Section>
      {/*
        A plain `h1`, matching `/faq`. `SectionHeading` renders an `h2` — correct
        for a section inside a page, wrong for the page's own title, and this
        page used it for both. The document's heading order started at level 2,
        which is the one structural error a screen-reader user cannot work
        around by reading further.
      */}
      <h1 className="text-3xl font-black leading-tight text-ink sm:text-4xl">Help</h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-secondary">
        Answers to the things shoppers ask most, and a line straight to support.
      </p>
      <div className="mt-8 max-w-2xl">
        <HelpFaqs />
        <HelpWhatsAppButton className="mt-6" />
        {/*
          The same commitment `/contact` publishes, from the same constant.
          `/help` is the other support door — it is in the footer as "Help
          centre" — and it stated no turnaround at all, so which promise a
          visitor got depended on which door they came through. Reading from
          `RESPONSE_TIMES` rather than restating it means the two cannot drift;
          the founder ruling that set these numbers is dated 2026-07-31.
        */}
        <p className="mt-6 text-sm leading-relaxed text-secondary">
          We reply on WhatsApp {RESPONSE_TIMES.whatsapp}, and within{" "}
          {RESPONSE_TIMES.form} by email or the{" "}
          <Link href="/contact" className="underline underline-offset-4 hover:text-ink">
            contact form
          </Link>
          . If we are going to be slower than that, we will tell you.
        </p>
        <p className="mt-4 text-sm text-secondary">
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
