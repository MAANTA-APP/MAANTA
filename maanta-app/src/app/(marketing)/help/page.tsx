import type { Metadata } from "next";
import Link from "next/link";
import { HelpFaqs, HelpWhatsAppButton } from "@/components/marketing/help-content";
import { HelpStatePanels } from "@/components/marketing/HelpStatePanels";
import { Section } from "@/components/marketing/sections";
import { HELP_DESCRIPTION, SUPPORT_REPLY_LINE } from "@/lib/marketing/live-claims";
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
  // This snippet carried "We reply on WhatsApp the same day, and within 1
  // business day by email" — a support commitment with no support team behind
  // it. No response time may be published (founder ruling 2026-09-04, X9);
  // the description reads from the same constant as the page body.
  description: HELP_DESCRIPTION,
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
        {/*
          Drawn *outside* HelpFaqs on purpose: that component is shared with
          `(shopper)/you/help` in the app shell, where a signed-in shopper can
          open the real screen instead of looking at a picture of it.
        */}
        <HelpStatePanels />
        <HelpWhatsAppButton className="mt-8" />
        {/*
          The same line `/contact` publishes, from the same constant
          (`SUPPORT_REPLY_LINE`). It used to read the 2026-07-31
          `RESPONSE_TIMES`; those were withdrawn on 2026-09-04 because no support
          team exists to meet them. Reading one constant means the two doors
          cannot promise different things.
        */}
        <p className="mt-6 text-sm leading-relaxed text-secondary">
          {SUPPORT_REPLY_LINE} You can also use the{" "}
          <Link href="/contact" className="underline underline-offset-4 hover:text-ink">
            contact page
          </Link>
          .
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
