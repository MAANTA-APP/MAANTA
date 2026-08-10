import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Section } from "@/components/marketing/sections";

/**
 * 12j 404.
 *
 * ## Why this carries the marketing shell
 *
 * It used to render a bare `<main>`: a `404`, one line of copy, and a single
 * "Back to home" button, with no header, no footer and no nav. A 404 is
 * overwhelmingly reached from outside — a stale link, a typo, an old share — so
 * it is a first impression as often as it is an error, and the version without
 * chrome gave a visitor exactly one thing to do and no idea what the site was.
 * The header and footer are the recovery mechanism the page was missing; the
 * links below are for the case where a visitor knows what they wanted but not
 * where it moved.
 *
 * Root `not-found.tsx` renders inside `app/layout.tsx` only — route group
 * layouts do not apply to it — so the shell is composed here rather than
 * inherited. That is also why this file, not `(marketing)/layout.tsx`, owns the
 * skip link.
 *
 * ## Why it has its own metadata
 *
 * Without it the page inherited the root layout's, so every 404 on the site
 * served the home page's `<title>`, the home page's description and
 * `og:url=https://www.maanta.app` — a 404 describing itself as the home page in
 * every field a crawler or an unfurl reads.
 *
 * `openGraph: null` clears the inherited card rather than replacing it. There
 * is no honest value for `og:url` here: the URL that 404'd is not a page, and
 * naming any other one describes something this response is not. A 404 has
 * nothing to unfurl, so it should unfurl as nothing.
 *
 * No `robots` export: Next already serves this response `noindex`, and adding
 * it here emitted a second `<meta name="robots">` alongside Next's. `follow` is
 * the default, so the recovery links below are still crawlable.
 *
 * One amber action, per the frozen UI rules — the primary button. Everything
 * else is a plain link.
 */
export const metadata: Metadata = {
  title: "Page not found — MAANTA",
  description:
    "That page is not here. Find deals for shoppers, pricing for merchants, or how a mall node works.",
  openGraph: null,
};

/** The four doors worth offering someone who arrived at the wrong URL. */
const RECOVERY = [
  { label: "For shoppers", href: "/shoppers" },
  { label: "For merchants", href: "/merchants" },
  { label: "For mall operators", href: "/mall-operators" },
  { label: "Questions", href: "/faq" },
] as const;

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Section>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Error 404</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-ink sm:text-4xl">
            Page not found
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-secondary">
            This page wandered off the mall directory. It may have moved, or the link may
            have been mistyped.
          </p>

          <ButtonLink href="/" className="mt-8">
            Back to home
          </ButtonLink>

          <div className="mt-12 border-t border-line pt-8">
            <h2 className="text-sm font-bold text-ink">Or start here</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {RECOVERY.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="text-base font-semibold text-ink underline underline-offset-4 hover:text-secondary"
                  >
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm leading-relaxed text-secondary">
              Looking for something specific?{" "}
              <Link href="/contact" className="underline underline-offset-4 hover:text-ink">
                Talk to us
              </Link>
              .
            </p>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
