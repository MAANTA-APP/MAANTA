import Link from "next/link";
import { BrandLockup } from "@/components/marketing/BrandLockup";
import { FOOTER_COLUMNS, LEGAL_LINKS } from "@/lib/marketing/nav";
import { ENTITY } from "@/lib/marketing/demo";
import { PrelaunchNotice } from "./PrelaunchNotice";
import { RegulatoryStatus } from "./RegulatoryStatus";
import {
  ENTITY_LINE,
  NODE_STATUS_LINE,
  SHOW_LIVE_INDICATOR,
} from "@/lib/marketing/live-claims";

/**
 * Five columns plus a legal base bar (`website-footer-legal-docs-plan.md` §2).
 *
 * Columns 2–4 come from `lib/marketing/nav.ts`; brand and contact are structural
 * and composed here. Every link resolves to a page with real content — no `#`,
 * no "coming soon". Careers, Press kit, Merchant guide, Security and Status are
 * deferred and therefore absent rather than dead.
 *
 * **No social row.** Ship an icon only for an account that exists and is actively
 * posted to; none has been confirmed. An absent row reads as deliberate, an empty
 * profile reads as abandoned.
 *
 * **No newsletter field.** `/waitlist` already collects name, email, phone and
 * role with explicit marketing consent — strictly better than an unsegmented
 * email box, and a second capture surface would split the list and duplicate the
 * consent problem.
 *
 * Not shared with the app shell. `/feed` and `/you` have their own chrome, so
 * changes here cannot leak into the product (risk R4, confirmed in Phase 0).
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-paper">
      {/*
        Row gap is larger than column gap. At the 2-column breakpoint the columns
        stack into pairs, and an equal gap leaves "Company" reading as a
        continuation of the column above it rather than a heading of its own.
      */}
      <div className="mx-auto max-w-6xl px-5 py-14 sm:py-16">
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-5">
          {/* Column 1 — brand */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center" aria-label="MAANTA home">
              <BrandLockup className="h-8 w-auto" />
            </Link>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-secondary">
              Live mall deals, claimed on your phone and verified at the counter.
            </p>
            {/*
              The node line. Amber as a live-status indicator is the other
              sanctioned use of the accent — a dot, not a fill — but only once
              there is a live status to indicate, so both the dot and the
              wording are gated (drift **D90**).

              The dot is written out here rather than using <LiveDot />, which
              is exactly why suppressing that component did not reach it: this
              footer went on rendering an amber status indicator beside the
              location on every page of the site, a few inches above
              PrelaunchNotice saying MAANTA is not yet trading. Found by
              scanning built HTML for the markup, not the copy — a claim made
              in colour leaves no phrase to grep for.
            */}
            <p className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-ink">
              {SHOW_LIVE_INDICATOR ? (
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-full bg-brand"
                />
              ) : null}
              {NODE_STATUS_LINE}
            </p>
            <Link
              href="/download"
              className="mt-3 inline-block text-[13px] font-semibold text-ink underline underline-offset-4 hover:text-secondary"
            >
              Install the app
            </Link>
          </div>

          {/* Columns 2–4 — from the nav module */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
                {col.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[13px] text-secondary transition-colors hover:text-ink hover:underline hover:underline-offset-4"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Column 5 — contact */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Contact</h2>
            <ul className="mt-4 space-y-2.5 text-[13px] text-secondary">
              <li>
                <a
                  href={`mailto:${ENTITY.email}`}
                  className="hover:text-ink hover:underline hover:underline-offset-4"
                >
                  {ENTITY.email}
                </a>
              </li>
              <li>
                <a
                  href={ENTITY.whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-ink hover:underline hover:underline-offset-4"
                >
                  WhatsApp support
                </a>
              </li>
              {/*
                No "In-mall desk" entry, and no address. MAANTA has no desk or
                office in BBS Mall until the mall authorises the relationship
                (D261). Email and WhatsApp are the only two channels that exist.
              */}
            </ul>
          </div>
        </div>

        {/* Legal base bar */}
        <div className="mt-14 border-t border-line pt-8">
          <PrelaunchNotice />
          {/* Rendered in place of any licence identifier — demo-mode-spec §2,
              DECIDED 2026-07-31 (drift D75). */}
          <RegulatoryStatus className="mt-4" />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-muted">© MAANTA 2026 · {ENTITY_LINE}</p>
            <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
              {LEGAL_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-[12px] text-muted hover:text-ink hover:underline hover:underline-offset-4"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
