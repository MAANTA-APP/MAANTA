import Link from "next/link";
import { PrelaunchNotice } from "@/components/marketing/PrelaunchNotice";

/**
 * The funnel shell — `/waitlist` and `/merchants/join`.
 *
 * Board 2 draws both forms **without the marketing chrome**: no five-link
 * header, no CTA competing with the form's own button, no footer columns to
 * scroll past on a phone. A person on these routes has already decided; the
 * page's whole job is to not get in the way of the one thing they came to do.
 *
 * A route group is the only way to give two URLs a different shell without
 * moving them — `(funnel)` is URL-invisible, so `/waitlist` and
 * `/merchants/join` keep every inbound link, sitemap entry and OG image they
 * had under `(marketing)`.
 *
 * What survives from the marketing shell, deliberately: the skip link, the
 * single `main` landmark, and `PrelaunchNotice` — the footer line that keeps
 * the whole site honest while `DEMO_MODE` holds (`demo-mode-spec.md` §3b).
 * The consent copy on each form links to the privacy policy itself; the three
 * legal links here are so nothing a person is asked to agree to is more than
 * one tap away.
 */
export default function FunnelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line px-5 py-5 lg:px-20">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <PrelaunchNotice />
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
            <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
              Terms
            </Link>
            <Link href="/merchant-terms" className="underline underline-offset-2 hover:text-ink">
              Merchant Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
