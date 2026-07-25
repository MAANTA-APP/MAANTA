"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorState } from "@/components/ui/states";

/**
 * Admin segment error boundary. A failed operator query retries in-context
 * instead of escaping to the global boundary. User-facing copy only — no status
 * codes or provider names, even on an operator surface.
 */
export default function AdminError({
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
    <div className="pt-10">
      <ErrorState
        message="Something went wrong — try again in a moment."
        onRetry={reset}
      />
    </div>
  );
}
