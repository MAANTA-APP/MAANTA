"use client";

import { ErrorState } from "@/components/ui/states";

/**
 * Feed error boundary. Triggered when the deals query fails (getLiveDeals now
 * throws on a hard error instead of returning empty), so a transient load
 * failure reads as a retryable problem — never as "no deals live right now".
 * User-facing copy only: no status codes, no provider names.
 */
export default function FeedError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-4">
      <ErrorState
        message="We couldn't load deals — try again in a moment."
        onRetry={reset}
      />
    </main>
  );
}
