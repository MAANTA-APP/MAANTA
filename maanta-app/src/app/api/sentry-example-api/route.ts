export const dynamic = "force-dynamic";

class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}

/** Faulty API route used by /sentry-example-page to verify server-side capture. */
export function GET() {
  throw new SentryExampleAPIError(
    "This error is raised on the backend called by the example page.",
  );
}
