import type { MetadataRoute } from "next";
import { getAppOrigin } from "@/lib/app-url";

/**
 * `robots.txt` — did not exist before this change.
 *
 * Disallows the authenticated and operational surfaces, which have no business in
 * search results and in some cases leak structure (`/admin`, `/agent`,
 * `/founder`). `/api` is disallowed for the same reason.
 *
 * **The four legal routes are deliberately NOT disallowed** (founder ruling
 * 2026-08-01, `docs/maanta-decisions-log.md`; option B of `LEG-02` in
 * `docs/ops/marketing-site-gap-audit.md` §6.2). They used to be, while `DEMO_MODE`
 * was true, on a belt-and-braces argument. The argument does not survive contact
 * with what the two mechanisms actually do:
 *
 *  - `Disallow` stops a *crawl*, not an *index*. A disallowed URL linked from
 *    elsewhere can still be listed — as a bare URL with no snippet, precisely
 *    because the crawler was forbidden from reading the page that says
 *    `noindex`. All four are linked from the footer of every page on this site,
 *    so the disallow was working against the noindex rather than reinforcing it.
 *  - App-store and payment-provider reviews frequently require the privacy policy
 *    to be publicly fetchable. A disallowed `/privacy` can fail those checks, and
 *    a failed submission is a far worse outcome than a ranked draft.
 *
 * The protection that was actually wanted is unaffected: each legal page still
 * emits `<meta name="robots" content="noindex, nofollow">` from its own
 * `metadata` export while `DEMO_MODE` is true — verified in production HTML on
 * 2026-08-01 (drift `D42`), and guarded by
 * `src/lib/__tests__/marketing-a11y.test.ts`.
 *
 * They stay out of `sitemap.ts` for the unchanged reason: a sitemap that
 * advertises a `noindex` page sends two contradictory instructions. Absent from
 * the sitemap and `noindex` agree with each other; the disallow was the odd one
 * out.
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
  ];

  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
