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
 * claims anything MAANTA cannot do. MAANTA has **no offline capability**:
 * `public/sw.js` handles `push` and `notificationclick` and has no `fetch`
 * handler or Cache Storage, so nothing is stored for offline use, and a claim
 * or a redemption cannot complete without the network in any case —
 * `claim_deal` and `verify_redemption` are RPCs. The banner previously read
 * "showing saved deals", which promised exactly the thing that does not exist,
 * on the merchant shell as well as the shopper one (drift D92).
 *
 * So: no wording here may imply deals are saved, previously loaded deals
 * survive, a claim or redemption works offline, or that anything will be
 * retried later. Any future offline caching work changes the service worker
 * first and this map second, never the other way round.
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
