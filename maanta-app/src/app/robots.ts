import type { MetadataRoute } from "next";
import { LEGAL_ROUTES } from "@/lib/marketing/nav";
import { DEMO_MODE } from "@/lib/marketing/demo";
import { getAppOrigin } from "@/lib/app-url";

/**
 * `robots.txt` — did not exist before this change.
 *
 * Disallows the authenticated and operational surfaces, which have no business in
 * search results and in some cases leak structure (`/admin`, `/agent`,
 * `/founder`). `/api` is disallowed for the same reason.
 *
 * While `DEMO_MODE` is true the four legal routes are disallowed too. They also
 * carry a `noindex` meta tag from their own `metadata` export — belt and braces,
 * because the two mechanisms fail differently: `robots.txt` stops a crawl,
 * `noindex` stops indexing of a page reached some other way (a shared link, an
 * inbound reference). An unreviewed draft contract that has been indexed outlives
 * the draft, and neither mechanism alone reliably prevents that.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = getAppOrigin() ?? "https://www.maanta.app";

  const disallow = [
    "/api/",
    "/admin",
    "/agent",
    "/founder",
    "/merchant/",
    "/onboarding",
    "/otp",
    "/select-mall",
    "/verify-phone",
    "/app-bootstrap",
    "/sentry-example-page",
    ...(DEMO_MODE ? LEGAL_ROUTES : []),
  ];

  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
