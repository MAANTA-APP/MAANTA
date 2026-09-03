import Link from "next/link";
import type { Metadata } from "next";

/**
 * The service worker's offline fallback document (D235).
 *
 * Statically rendered on purpose: it is precached at worker install, so it must
 * not depend on a request, a session or the database. It sits outside every
 * route group because it is served in place of any page — shopper, merchant or
 * marketing — when the network is gone and nothing better is cached.
 *
 * The copy states a blocked state and the next step and promises nothing, under
 * the same rule as `OFFLINE_MESSAGE` in `components/ui/states.tsx`: no wording
 * here may imply that deals are saved, that a claim will be retried, or that a
 * redemption can complete. The one thing MAANTA *can* do offline is show a code
 * already claimed, so that is the only thing offered.
 */
export const metadata: Metadata = {
  title: "Offline — MAANTA",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col justify-center px-6 text-center">
      <h1 className="text-xl font-bold text-ink">You&apos;re offline</h1>
      <p className="mt-3 text-sm leading-relaxed text-secondary">
        This page needs a connection. If you have already claimed a deal, your code is
        saved on this device and can still be shown at the counter.
      </p>
      <Link
        href="/my-deals"
        className="mt-6 inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-bold text-ink-soft"
      >
        Show my codes
      </Link>
      <p className="mt-6 text-xs text-muted">
        Claiming a new deal and verifying one at the till both need a connection.
      </p>
    </main>
  );
}
