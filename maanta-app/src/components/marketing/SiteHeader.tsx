"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup } from "@/components/marketing/BrandLockup";
import { HEADER_CTA, HEADER_LINKS, HEADER_SIGN_IN } from "@/lib/marketing/nav";

/**
 * Marketing header — audience nav plus a mobile sheet.
 *
 * The header must expose all three audiences (`website-ia.md` §5). The one it
 * replaces exposed none: How it works · Pricing · FAQ told a mall operator
 * nothing about whether the site was for them. "How it works" is folded into
 * `/shoppers` and FAQ moves to the footer, both in this same change, so the nav
 * label and its 301 never disagree.
 *
 * Links come from `lib/marketing/nav.ts` so header, footer and sitemap cannot
 * drift apart.
 *
 * `Browse deals` is the one amber element here — #FDBF2D on CTAs and live-status
 * only. A second amber element in the same bar would spend the accent and leave
 * the actual call to action competing with decoration.
 *
 * `Sign in` sits beside it as a quiet outline (D259). Until 2026-09-03 the
 * public site had no way in at all: a returning merchant, agent or admin on
 * any marketing page had to know `/login` by heart. It is one link for every
 * role, because `/app-bootstrap` routes by role after sign-in — so it is
 * labelled "Sign in", never "Admin sign in", and it is rendered in both the
 * desktop bar and the mobile sheet, since a header entry the phone audience
 * cannot see is not an entry.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  // Close the sheet on navigation — otherwise it stays open over the new page.
  useEffect(() => setOpen(false), [pathname]);

  /*
    Shadow only once the page has moved. At rest the header is part of the hero
    wash and a shadow there is decoration; after a scroll it is doing real work,
    separating the bar from content passing under the backdrop blur.

    Read once on mount too: a browser restoring scroll position on back/forward
    fires no scroll event, and the header would sit flat over mid-page content.
  */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock the background from scrolling behind the open sheet.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes the sheet — keyboard parity with the close button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={`sticky top-0 z-30 bg-stone/95 backdrop-blur transition-shadow ${
        scrolled ? "shadow-card" : ""
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link href="/" className="flex shrink-0 items-center" aria-label="MAANTA home">
          {/* One asset, not a mark plus an approximated wordmark. `priority`
              because this is above the fold on every marketing page. */}
          <BrandLockup className="h-8 w-auto" priority />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-6 text-sm font-medium text-muted lg:flex"
        >
          {HEADER_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={
                isActive(l.href)
                  ? "text-ink underline decoration-2 underline-offset-8"
                  : "hover:text-ink"
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Secondary: outline, ink label. The amber budget is spent on
              Browse deals, and sign-in is the way in, not the point. */}
          <Link
            href={HEADER_SIGN_IN.href}
            className="hidden rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink sm:inline-flex"
          >
            {HEADER_SIGN_IN.label}
          </Link>
          <Link
            href={HEADER_CTA.href}
            className="hidden rounded-full bg-brand px-4 py-2 text-sm font-bold text-ink-soft transition hover:brightness-95 sm:inline-flex"
          >
            {HEADER_CTA.label}
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="marketing-mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink lg:hidden"
          >
            {/* Plain glyphs: two states, no icon dependency to keep in sync. */}
            <span aria-hidden="true" className="text-lg leading-none">
              {open ? "✕" : "☰"}
            </span>
          </button>
        </div>
      </div>

      {/*
        Mobile sheet. `Browse deals` is pinned at the top of the sheet rather than
        buried under the audience links — it is the primary action for the
        largest audience, and the shopper audience is almost entirely mobile.
      */}
      {open ? (
        <div id="marketing-mobile-nav" className="border-t border-line bg-stone lg:hidden">
          <nav aria-label="Primary (mobile)" className="mx-auto max-w-6xl px-5 py-4">
            <Link
              href={HEADER_CTA.href}
              className="mb-3 block rounded-full bg-brand px-4 py-3 text-center text-sm font-bold text-ink-soft"
            >
              {HEADER_CTA.label}
            </Link>
            {/* Directly under the primary action, above the audience list:
                the sheet is the whole navigation on a phone, so the way in
                cannot be at the bottom of it. */}
            <Link
              href={HEADER_SIGN_IN.href}
              className="mb-3 block rounded-full border border-line px-4 py-3 text-center text-sm font-semibold text-ink"
            >
              {HEADER_SIGN_IN.label}
            </Link>
            <ul className="divide-y divide-line">
              {HEADER_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={isActive(l.href) ? "page" : undefined}
                    className={`block py-3 text-base font-semibold ${
                      isActive(l.href) ? "text-ink" : "text-secondary"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
