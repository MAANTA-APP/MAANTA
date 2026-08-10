import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Permanent redirects for the marketing IA change.
   *
   * These are **308s**, not 301s. `permanent: true` in Next.js emits 308
   * (`permanent: false` emits 307); this comment said 301 until 2026-08-02 and
   * was wrong for as long as it existed — drift **D57**. The distinction is not
   * pedantry: a 301 permits a client to rewrite POST to GET on the redirect,
   * a 308 requires the method and body to be preserved. Verified against the
   * build rather than the config: `.next/routes-manifest.json` lists all three
   * with `statusCode: 308`.
   *
   * They are permanent because the old paths are printed on flyers, pasted into
   * WhatsApp groups and used on in-mall signage (risk R6) — inbound links that
   * nobody can edit after the fact. `permanent: true` is deliberate and hard to
   * walk back, which is the correct trade for URLs that live off-platform.
   *
   * Three redirects, not the four listed in `website-handoff.md` §5. The fourth
   * row there — "old `/merchants` form → `/merchants/join`" — is a **component
   * move, not a URL redirect**. `/merchants` becomes the merchant marketing page,
   * so redirecting it to `/merchants/join` would make that page unreachable and
   * dark-route the audience it was written for. The lead form relocated to
   * `/merchants/join`; anyone deep-linking `/merchants` for the form now lands on
   * the marketing page whose primary CTA points at it. Recorded as a deviation in
   * `docs/ops/IMPLEMENTATION-REPORT.md` §5.
   *
   * The header nav label changed in the same change that added these, so
   * "How it works" and its redirect can never disagree.
   */
  async redirects() {
    return [
      { source: "/for-shoppers", destination: "/shoppers", permanent: true },
      { source: "/for-merchants", destination: "/merchants", permanent: true },
      { source: "/how-it-works", destination: "/shoppers", permanent: true },
    ];
  },

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
  /**
   * Security response headers (SEC-007).
   *
   * MAANTA is a money surface — a merchant verifies a 6-digit code and a shopper
   * reads what they will pay — so being framable by another origin is a real
   * clickjacking risk, not a theoretical one. Nothing set any of these before.
   *
   * `frame-ancestors 'none'` is the modern control and `X-Frame-Options: DENY`
   * is the fallback for anything that predates it; both are set deliberately
   * rather than one or the other.
   *
   * A **full** Content-Security-Policy is deliberately NOT set here. This app
   * loads Clerk, Sentry, Leaflet tiles and PostHog, and a strict script-src
   * shipped blind would break a live surface in a way no check in this repo
   * would catch — CI has no browser, and the golden-path e2e run is gated on
   * `E2E_BASE_URL`. `frame-ancestors` is the one CSP directive that is safe to
   * ship without that testing, because it constrains who may frame this page and
   * nothing about what the page itself may load. Adding the rest belongs with a
   * report-only rollout and a real report sink.
   *
   * HSTS is intentionally absent: Vercel sets `Strict-Transport-Security` at the
   * edge for custom domains, and declaring it here would be a second, weaker
   * source of truth for a header with a long, hard-to-reverse max-age. Confirm
   * it on the live response rather than assuming either way.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // The app asks for none of these. Geolocation is the one to watch:
            // the shopper map uses it, but through the browser prompt on a
            // same-origin script, which `self` still permits.
            value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
          },
        ],
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
