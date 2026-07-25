"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // global-error replaces the whole document, so the app's fonts/tokens from the
  // root layout aren't available — inline a matching system stack and the brand
  // paper/ink/flame values so even the last-resort screen looks like MAANTA.
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: "#FAFAF8",
          color: "#111111",
          margin: 0,
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 32,
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#8C1D18",
              lineHeight: 1,
            }}
            aria-hidden
          >
            !
          </span>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "#5C5C5C", margin: 0, maxWidth: 260 }}>
            The error has been reported — please try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              height: 44,
              padding: "0 24px",
              borderRadius: 999,
              border: "1px solid #111111",
              background: "#fff",
              color: "#111111",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
