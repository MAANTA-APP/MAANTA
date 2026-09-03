"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/ui";
import { Button, ButtonLink } from "@/components/ui/button";

/** 7a Empty state */
export function EmptyState({
  title,
  sub,
  actionLabel,
  actionHref,
  onAction,
  className,
}: {
  title: string;
  sub?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 py-16 text-center", className)}>
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.5px] border-ink bg-white text-base text-ink">
        ○
      </span>
      <p className="text-base font-bold text-ink">{title}</p>
      {sub ? <p className="-mt-1 max-w-[240px] text-[13px] leading-relaxed text-secondary">{sub}</p> : null}
      {actionLabel && actionHref ? (
        <ButtonLink href={actionHref} variant="primary" size="md" className="mt-1">
          {actionLabel}
        </ButtonLink>
      ) : actionLabel && onAction ? (
        <Button onClick={onAction} variant="primary" size="md" className="mt-1">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** 7b Error state */
export function ErrorState({
  message = "Something went wrong",
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 py-16 text-center", className)}>
      <span className="text-2xl font-black text-flame">!</span>
      <p className="text-sm font-semibold text-ink">{message}</p>
      {onRetry ? (
        <Button onClick={onRetry} variant="ghost" size="sm">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/** 7c Loading skeleton */
export function Skeleton({ className }: { className?: string }) {
  // Sits on the paper background, so the shimmer must be a shade darker than paper.
  return <div className={cn("animate-pulse rounded-xl bg-cream-dark", className)} />;
}

export function DealCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-white shadow-card">
      <Skeleton className="h-36 w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  );
}

/**
 * Which shell is rendering the banner. It decides the reconnect instruction
 * only — never whether the banner appears.
 */
export type OfflineContext = "shopper" | "merchant" | "generic";

/**
 * The only offline copy in the product.
 *
 * Every string here states a blocked state and the next step, and none of them
 * claims anything MAANTA cannot do.
 *
 * ## What changed on 2026-09-03, and what did not
 *
 * This docblock used to say MAANTA had **no offline capability** at all, and
 * that was true: `public/sw.js` handled `push` and `notificationclick` and had
 * no `fetch` handler. D235 added one. Exactly **one** document is now cached —
 * `/my-deals`, so a claimed 6-digit code survives a dead network at the
 * counter — plus immutable build assets and an offline fallback page.
 *
 * Everything the old wording forbade is still forbidden, because none of it
 * became true:
 *
 *  - **Deals are not saved.** The feed is deliberately not cached: a stale feed
 *    advertises deals that may be gone, which is the promise D92 removed from
 *    this banner in the first place. So the shopper line still says live deals
 *    need a connection.
 *  - **A claim and a redemption still cannot happen offline**, and nothing is
 *    queued for retry. `claim_deal` decrements a cap and mints an OTP;
 *    `verify_redemption` moves money. Both are RPCs.
 *
 * The rule that follows is unchanged and now has a worked example: offline
 * caching work changes the service worker first and this map second, never the
 * other way round.
 *
 * The one thing MAANTA *can* now do offline is show a code already claimed, and
 * that is said where it is relevant — on the code screen itself, by
 * `TicketOfflineNotice` — rather than in a shell banner that also renders over
 * the feed, where it would be false.
 */
export const OFFLINE_MESSAGE: Record<OfflineContext, string> = {
  shopper: "You're offline. Reconnect to load live deals.",
  merchant: "You're offline. Reconnect before verifying a redemption.",
  generic: "You're offline. Reconnect to continue.",
};

/**
 * 7d Offline banner — black strip, auto-shows when the browser goes offline.
 *
 * `context` is a prop rather than something the component sniffs from the
 * route, so each shell states its own truth and the component never guesses.
 * It defaults to the generic line, which is safe anywhere.
 *
 * The live region is mounted at all times and only its *text* changes.
 * Conditionally rendering the strip — what this did before — inserts a live
 * region and its content in the same tick, which assistive tech announces
 * unreliably, so the state was effectively silent for screen-reader users.
 * `aria-live="polite"` queues the announcement behind whatever the user is
 * doing, so a connectivity flap never interrupts. When online the wrapper has
 * no classes and no children, so it adds no height to either shell's flex
 * column and the layout is byte-identical to before.
 */
export function OfflineBanner({
  context = "generic",
}: {
  context?: OfflineContext;
}) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return (
    <div role="status" aria-live="polite">
      {offline ? (
        <div className="bg-ink px-4 py-2 text-center text-xs font-semibold text-white">
          {OFFLINE_MESSAGE[context]}
        </div>
      ) : null}
    </div>
  );
}
