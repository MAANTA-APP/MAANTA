"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorState } from "@/components/ui/states";

export default function FounderError({
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
    <div className="flex min-h-[70dvh] flex-col items-center justify-center">
      <ErrorState
        message="Something went wrong — try again in a moment."
        onRetry={reset}
      />
    </div>
  );
}
