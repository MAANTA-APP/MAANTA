"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorState } from "@/components/ui/states";

/**
 * Shopper segment error boundary. A failed query on any shopper screen (bar the
 * feed, which has its own) now reads as a retryable problem in-context instead
 * of escaping to the global boundary. User-facing copy only — no status codes,
 * no provider names.
 */
export default function ShopperError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="px-4 pt-10">
      <ErrorState
        message="Something went wrong — try again in a moment."
        onRetry={reset}
      />
    </main>
  );
}
