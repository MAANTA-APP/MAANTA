import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  beforeSend: (event) => scrubEvent(event),
});
