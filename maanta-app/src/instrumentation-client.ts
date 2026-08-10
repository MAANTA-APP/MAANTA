import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

// Client-side Sentry init. Replaces sentry.client.config.ts so Turbopack dev
// (`next dev --turbo`) instruments the browser. No-op when DSN is unset.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  beforeSend: (event) => scrubEvent(event),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
