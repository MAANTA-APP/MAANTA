import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
};

// Sentry is a no-op until SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN are set.
// Source-map upload needs SENTRY_AUTH_TOKEN and is skipped without it.
export default withSentryConfig(nextConfig, {
  silent: true,
});
