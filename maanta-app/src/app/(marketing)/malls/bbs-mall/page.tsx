import type { Metadata } from "next";
import { FACTS } from "@/lib/marketing/facts";
import { ButtonLink } from "@/components/ui/button";
import { LiveDot } from "@/components/marketing/sections";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { NODE_BADGE, NODE_CITY_LINE, NODE_FEED_NOTE, NODE_PAGE_DESCRIPTION, NODE_PAGE_INTRO, SHOW_LIVE_INDICATOR } from "@/lib/marketing/live-claims";
import { DEMO_DISCLOSURE, DEMO_FEED_HREF, POTENTIAL_LOCATION_EYEBROW } from "@/lib/marketing/pilot-status";
import Link from "next/link";

/**
 * `/malls/bbs-mall` — the potential first location, as a potential location.
 *
 * Founder direction 2026-09-05: BBS Mall in Eastleigh is one candidate for the
 * first Nairobi pilot. No agreement, permission, desk, staff presence, launch
 * date or operating presence may be implied, and no BBS branding or
 * endorsement is shown. Every sentence here reads from `live-claims.ts`, whose
 * pre-launch branches carry that qualification.
 *
 * Counts were removed on 2026-07-31 (founder ruling; risk R11) and stay
 * removed: with `demo_mode_enabled` on, a live query would print synthetic
 * rows as traction.
 */

export const metadata: Metadata = pageMetadata({
  path: "/malls/bbs-mall",
  title: `${FACTS.candidateMall} — potential pilot location — MAANTA`,
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
          <h1 className="mt-4 text-4xl font-black text-brand">{FACTS.candidateMall}</h1>
          <p className="mt-2 text-sm text-white/70">
            {POTENTIAL_LOCATION_EYEBROW} for MAANTA&apos;s first Nairobi pilot. No agreement, permission or
            launch date has been confirmed.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-12">
        <p className="max-w-2xl text-base leading-relaxed text-secondary">{NODE_PAGE_INTRO}</p>
        <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <LiveDot />
          {NODE_CITY_LINE}
        </p>
        <p className="mt-8 max-w-2xl text-base leading-relaxed text-secondary">{NODE_FEED_NOTE}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <ButtonLink href={DEMO_FEED_HREF}>Explore demo deals</ButtonLink>
          <Link
            href="/waitlist"
            className="text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
          >
            Choose your preferred location →
          </Link>
        </div>
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted">{DEMO_DISCLOSURE}</p>
      </section>
    </div>
  );
}
