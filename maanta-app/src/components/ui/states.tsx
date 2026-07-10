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
      <div className="h-16 w-16 rounded-full border-2 border-dashed border-cream-dark" />
      <p className="text-sm font-semibold text-ink">{title}</p>
      {sub ? <p className="-mt-2 text-xs text-muted">{sub}</p> : null}
      {actionLabel && actionHref ? (
        <ButtonLink href={actionHref} variant="ghost" size="sm">
          {actionLabel}
        </ButtonLink>
      ) : actionLabel && onAction ? (
        <Button onClick={onAction} variant="ghost" size="sm">
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
  return <div className={cn("animate-pulse rounded-xl bg-cream", className)} />;
}

export function DealCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-white">
      <Skeleton className="h-36 w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  );
}

/** 7d Offline banner — black strip, auto-shows when the browser goes offline. */
export function OfflineBanner() {
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
  if (!offline) return null;
  return (
    <div className="bg-ink px-4 py-2 text-center text-xs font-semibold text-white">
      You&apos;re offline — showing saved deals
    </div>
  );
}
