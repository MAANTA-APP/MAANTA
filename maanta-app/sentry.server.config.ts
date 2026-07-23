import * as Sentry from "@sentry/nextjs";

// No-op when SENTRY_DSN is unset (local dev, CI). Payment webhook routes are
// the main thing this exists to watch — see logWebhookFailure in
// src/lib/merchant-ledger.ts, which reports every recorded failure here.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
