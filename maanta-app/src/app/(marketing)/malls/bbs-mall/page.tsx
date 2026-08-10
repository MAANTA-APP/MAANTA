import type { Metadata } from "next";
import { FACTS } from "@/lib/marketing/facts";
import { ButtonLink } from "@/components/ui/button";
import { LiveDot } from "@/components/marketing/sections";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { NODE_BADGE, NODE_CITY_LINE, NODE_FEED_NOTE, NODE_PAGE_DESCRIPTION, NODE_PAGE_INTRO, SHOW_LIVE_INDICATOR } from "@/lib/marketing/live-claims";

/**
 * 12k Featured node — BBS Mall, Eastleigh.
 *
 * **Counts removed, 2026-07-31 (founder ruling; risk R11).** This page used to
 * read live shop and deal counts from Supabase and print them in the hero. That
 * looked safe — the numbers were real queries, not hardcoded — but it had two
 * problems that only became visible once the marketing shell was separated:
 *
 *  1. With `app_config.demo_mode_enabled` on, those queries include synthetic
 *     rows, so the page rendered demo counts ("121 shops · 190 live deals") as
 *     though they were traction. That is the figure `website-expansion-plan.md`
 *     R11 names specifically.
 *  2. The demo-data banner is correctly scoped off marketing routes (R1), so
 *     there was no disclosure above those synthetic numbers. Scoping the banner
 *     and querying deal data on the same route is the one combination that had
 *     to be avoided, and this page was doing both.
 *
 * Removing the counts resolves both at once, and it costs the page nothing: a
 * prospective shopper wants to know the mall is live and to reach the feed, and
 * a merchant or operator reading a count they cannot verify is not persuaded by
 * it anyway. The live feed is one tap away and is the honest source.
 *
 * Restore counts only from a production-only query that excludes demo rows
 * unconditionally, and only once the numbers are worth quoting.
 */

export const metadata: Metadata = pageMetadata({
  path: "/malls/bbs-mall",
  title: "BBS Mall, Eastleigh — MAANTA",
  // Was 99 characters, leaving most of the snippet window unused on the Node 0
  // page every footer links to.
  description: NODE_PAGE_DESCRIPTION,
});

export default function BbsMallPage() {
  return (
    <div>
      <section className="bg-ink px-5 py-16">
        <div className="mx-auto max-w-4xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-bold text-ink">
            {SHOW_LIVE_INDICATOR ? (
              <span className="h-1.5 w-1.5 rounded-full bg-verified" />
            ) : null}
            {NODE_BADGE}
          </span>
          <h1 className="mt-4 text-4xl font-black text-brand">{FACTS.launchMall}</h1>
          <p className="mt-2 text-sm text-white/70">
            {FACTS.nodeLabel} — MAANTA&apos;s launch mall in {FACTS.city}.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-12">
        <p className="max-w-2xl text-base leading-relaxed text-secondary">
          {NODE_PAGE_INTRO}
        </p>
        <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <LiveDot />
          {NODE_CITY_LINE}
        </p>
        <p className="mt-8 max-w-2xl text-base leading-relaxed text-secondary">
          {NODE_FEED_NOTE}
        </p>
        <div className="mt-8">
          <ButtonLink href="/feed">Browse BBS Mall deals</ButtonLink>
        </div>
      </section>
    </div>
  );
}
