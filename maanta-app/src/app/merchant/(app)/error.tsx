"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorState } from "@/components/ui/states";

/**
 * Merchant app error boundary. A failed query on any merchant screen now offers
 * an in-context retry instead of crashing to the global boundary. The redeem
 * money path has its own failure handling; this covers the surrounding
 * management screens. User-facing copy only.
 */
export default function MerchantError({
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
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-5">
      <ErrorState
        message="Something went wrong — try again in a moment."
        onRetry={reset}
      />
    </main>
  );
}
