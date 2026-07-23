import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://eu-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  // Required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
  experimental: {
    instrumentationHook: true,
  },
};

// Sentry is a no-op until SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN are set.
// Source-map upload targets this org/project but is skipped unless
// SENTRY_AUTH_TOKEN is set (so CI/dev builds stay clean and quiet).
export default withSentryConfig(nextConfig, {
  org: "maanta",
  project: "javascript-nextjs",
  silent: true,
});
