import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Permanent redirects for the marketing IA change.
   *
   * These are 301s because the old paths are printed on flyers, pasted into
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
   * Response security headers — drift row **D62**.
   *
   * This app shipped with none of these. Neither Next.js nor Vercel adds them,
   * so their absence was the served state rather than a platform default
   * anyone was relying on.
   *
   * The four below are enforced because none of them can break a working page:
   * they constrain framing, MIME sniffing, referrer leakage and transport, and
   * this app has no legitimate need for any of the behaviour they remove.
   *
   * `frame-ancestors 'none'` is the one that mattered enough to do first.
   * `/merchant/redeem` is a money surface operated on a phone at a counter, and
   * with no framing rule any origin could iframe it. `X-Frame-Options` is sent
   * alongside for older browsers that do not honour the CSP directive.
   *
   * `Referrer-Policy` has a second, already-demonstrated reason: the merchant
   * onboarding handoff once leaked a phone number through `Referer`, fixed by
   * moving the value out of the URL rather than by constraining the header. The
   * header closes the general case that fix left open.
   *
   * `Permissions-Policy` allows `geolocation=(self)` deliberately — claim
   * geofencing and the browse map both need it. Camera and microphone are
   * denied outright; nothing in this product uses either.
   *
   * **CSP is Report-Only on purpose, and is not yet protection.** A wrong CSP
   * breaks sign-in, payments or the map, and the origin list here was assembled
   * by reading the source rather than by watching a real browser. Report-Only
   * never blocks, so this ships safely and surfaces violations in the browser
   * console for tuning. Promoting it to an enforcing `Content-Security-Policy`
   * is a separate change that needs a real browser pass across auth, top-up and
   * the map — see D62. Until then, do not describe this app as having a CSP.
   */
  async headers() {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";

    // Assembled from what the source actually loads: Clerk (auth widgets and
    // avatars), Sentry (error ingest), Supabase (REST + storage images),
    // OpenStreetMap tiles and unpkg (Leaflet's marker sprites). PostHog is
    // absent by design — it is proxied through the /ingest/* rewrites above and
    // so is same-origin.
    const csp = [
      "default-src 'self'",
      // 'unsafe-inline'/'unsafe-eval': Next.js injects inline bootstrap scripts
      // and Clerk evaluates at runtime. Removing these needs nonce plumbing and
      // is part of the promote-to-enforcing work, not a quick win.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://img.clerk.com https://*.tile.openstreetmap.org https://unpkg.com${supabase ? ` ${supabase}` : ""}`,
      "font-src 'self' data:",
      `connect-src 'self' https://*.clerk.accounts.dev https://*.ingest.sentry.io https://*.ingest.de.sentry.io${supabase ? ` ${supabase} ${supabase.replace(/^https:/, "wss:")}` : ""}`,
      "frame-src 'self' https://*.clerk.accounts.dev https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), payment=(), geolocation=(self)",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy-Report-Only", value: csp },
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
