"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorState } from "@/components/ui/states";

/**
 * Agent segment error boundary. A failed leads/console query retries in-context
 * instead of escaping to the global boundary. Mirrors the agent mobile frame.
 * User-facing copy only.
 */
export default function AgentError({
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
    <main className="mx-auto flex min-h-dvh max-w-mobile flex-col items-center justify-center border-x border-line bg-white px-5">
      <ErrorState
        message="Something went wrong — try again in a moment."
        onRetry={reset}
      />
    </main>
  );
}
