import type { MetadataRoute } from "next";
import { SITEMAP_ROUTES } from "@/lib/marketing/nav";
import { publicOrigin } from "@/lib/app-url";

/**
 * `sitemap.xml` — did not exist before this change (risk R5: new pages go
 * undiscovered).
 *
 * Generated from `lib/marketing/nav.ts`, so adding a route updates the header,
 * the footer and this file in one edit rather than three.
 *
 * **Legal routes are deliberately excluded.** They are `noindex` while their
 * contents are unreviewed drafts, and a sitemap that advertises a `noindex` page
 * sends search engines two contradictory instructions. They join the sitemap when
 * `DEMO_MODE` goes false and the `noindex` comes off — the same flip, in the same
 * commit.
 *
 * App routes (`/feed`, `/you`, `/merchant/*`, `/admin/*`) are absent by design:
 * they are authenticated or shopper-session surfaces, not indexable content.
 * `/feed` appears in the footer as a CTA but is not listed here for that reason.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Falls back to the canonical host: a sitemap with localhost URLs in it is
  // worse than no sitemap, and getAppOrigin() returns null in production when
  // NEXT_PUBLIC_APP_URL is unset. Shared with robots.ts and the JSON-LD so all
  // three public artifacts cannot disagree about the origin.
  const origin = publicOrigin();
  const lastModified = new Date();

  return SITEMAP_ROUTES.map((route) => ({
    url: `${origin}${route.path === "/" ? "" : route.path}`,
    lastModified,
    changeFrequency: route.path === "/" ? ("weekly" as const) : ("monthly" as const),
    priority: route.priority,
  }));
}
