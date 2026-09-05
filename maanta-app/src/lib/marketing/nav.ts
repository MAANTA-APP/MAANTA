import { DEMO_MODE } from "./demo";

/**
 * Single source of truth for header links, footer columns, legal links and the
 * sitemap. Adding a route here updates all four in one edit — the whole reason
 * the module exists (`website-footer-legal-docs-plan.md` §4).
 *
 * **Link hygiene is a hard rule.** No entry may point at `#` or a page that says
 * "coming soon". Careers, Press kit, Merchant guide, Security and Status are all
 * deferred and therefore simply absent: a five-column footer linking to empty
 * pages is worse than the thin footer it replaces, because the visual promise is
 * higher (risk R8).
 */

export const HEADER_LINKS = [
  { label: "Shoppers", href: "/shoppers" },
  { label: "Merchants", href: "/merchants" },
  { label: "Mall operators", href: "/mall-operators" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
] as const;

/**
 * The one amber element in the header.
 *
 * Founder direction 2026-09-05 (Nairobi pilot repositioning, superseding the
 * board-1 ruling of the same morning): pre-launch the primary action is
 * **Explore demo deals**, into the real feed. The feed serves demonstration
 * rows while `demo_mode_enabled` holds, carries its own disclosure banner
 * before any deal can be touched, labels every card "Demo", and stays
 * disallowed to crawlers. Flipping `DEMO_MODE` at launch restores "Browse
 * deals" in the same commit that restores every other trading claim.
 */
export const HEADER_CTA = DEMO_MODE
  ? ({ label: "Explore demo deals", href: "/feed" } as const)
  : ({ label: "Browse deals", href: "/feed" } as const);

/** Secondary header action, beside sign-in: the pilot-interest list. */
export const HEADER_WAITLIST = { label: "Join waitlist", href: "/waitlist" } as const;

/**
 * The shared sign-in entry. One `/login` for every role: after sign-in,
 * `/app-bootstrap` reads `public.users.role` and routes the person to their
 * own shell (`lib/pwa/app-bootstrap.ts`), so the header needs no
 * "Merchant sign in" / "Admin sign in" variants — and must not grow them,
 * because a role-named link on the public site would advertise a privileged
 * route as navigation. It is a secondary action: `HEADER_CTA` keeps the one
 * amber element in the bar (D259).
 */
export const HEADER_SIGN_IN = { label: "Sign in", href: "/login" } as const;

/**
 * Footer columns 2–4. Column 1 (brand) and column 5 (contact) are structural
 * rather than link lists, so `SiteFooter` composes them directly.
 *
 * Resources includes `/help` again as of 2026-07-31. It used to point only at
 * `/faq` because `/help` rendered inside the *app* shell and a footer link would
 * drop a visitor into product chrome mid-journey (risk R9). `/help` now renders
 * in the marketing shell, with the same content served to signed-in shoppers at
 * `/you/help`, so the interim workaround is retired.
 */
export const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Shoppers", href: "/shoppers" },
      { label: "Merchants", href: "/merchants" },
      { label: "Mall operators", href: "/mall-operators" },
      { label: "Pricing", href: "/pricing" },
      // The feed is demo deals until launch and says so on its face; the
      // footer names it as what it is (same ruling as HEADER_CTA).
      ...(DEMO_MODE ? [{ label: "Explore demo deals", href: "/feed" }] : [{ label: "Browse deals", href: "/feed" }]),
      { label: "Install the app", href: "/download" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Join the waitlist", href: "/waitlist" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help centre", href: "/help" },
      { label: "FAQ", href: "/faq" },
      { label: "Potential first location", href: "/malls/bbs-mall" },
    ],
  },
] as const;

export const LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Merchant Terms", href: "/merchant-terms" },
  { label: "Cookies", href: "/cookies" },
] as const;

/**
 * Routes carrying unreviewed legal drafts. `noindex` while `DEMO_MODE` is true —
 * a draft legal document indexed by Google is a liability that outlives the
 * draft (`demo-mode-spec.md` §3a).
 */
export const LEGAL_ROUTES = LEGAL_LINKS.map((l) => l.href);

/**
 * Every marketing route that should appear in `sitemap.xml`, with a relative
 * priority. Derived from the nav arrays above plus the supporting routes that
 * are reachable but not in the primary nav, so `app/sitemap.ts` never needs its
 * own hand-maintained list.
 *
 * Legal routes are excluded while they are drafts — they are `noindex`, and a
 * sitemap that advertises a `noindex` page sends a contradictory signal.
 */
/**
 * Route prefixes that must never be crawled, consumed by `app/robots.ts`.
 *
 * This list lives next to `SITEMAP_ROUTES` because the two are halves of one
 * policy, and they were allowed to disagree. `sitemap.ts` had already written
 * down the rule — app routes are "authenticated or shopper-session surfaces,
 * not indexable content" — and excluded them. `robots.ts` disallowed the
 * merchant, admin, agent and founder surfaces and left the whole signed-out
 * shopper surface open, so `/feed` was crawlable, returned HTTP 200 to an
 * anonymous client, and rendered demo deals under the homepage's own title
 * while `demo_mode_enabled` was true. It is also the target of the header CTA
 * and the home hero CTA, which makes it the most-linked page on the site.
 *
 * Two files, one policy, one place: `marketing-crawl-policy.test.ts` asserts
 * that every route in the app is either listed in `SITEMAP_ROUTES`, or a legal
 * route (which is `noindex` instead), or covered by a prefix here — so a new
 * route cannot land in the gap the way `/feed` did.
 *
 * **`/deals` is disallowed deliberately, not by omission.** A public deal-detail
 * page could eventually be worth indexing, but that is a product decision about
 * content that is currently synthetic, and it needs the demo data gone first.
 */
export const NON_INDEXABLE_PREFIXES = [
  // Operational and authenticated surfaces.
  "/api/",
  "/admin",
  "/agent",
  "/founder",
  "/merchant/",
  // `/merchant` exactly — the merchant app's landing page, which is an app
  // surface and also competes with `/merchants/join` for the same query. It
  // cannot be written as a bare `/merchant`, because robots.txt matching is
  // pure prefix and that would also disallow `/merchants` and
  // `/merchants/join`, two pages this site needs indexed. `$` anchors the
  // match to the end of the path; it is a Google/Bing extension rather than
  // part of the original standard, so a crawler that ignores it simply reads
  // a rule that never matches — the failure mode is the status quo, not a
  // wider block.
  "/merchant$",
  "/onboarding",
  "/otp",
  "/select-mall",
  "/verify-phone",
  "/app-bootstrap",
  "/sentry-example-page",
  // Shopper-session surfaces. Signed-out-readable, but not indexable content.
  "/feed",
  "/browse",
  "/map",
  "/search",
  "/deals",
  "/my-deals",
  "/tickets",
  "/shops",
  "/notifications",
  "/profile",
  "/you",
  // Counter-QR landing (/qr/<token>) — a physical-scan destination, never
  // content a crawler should index or a search result should surface.
  "/qr",
  // Auth entry points and the rehearsal index.
  "/login",
  "/sign-up",
  "/auth",
  "/demo",
] as const;

export const SITEMAP_ROUTES: ReadonlyArray<{ path: string; priority: number }> = [
  { path: "/", priority: 1.0 },
  { path: "/shoppers", priority: 0.9 },
  { path: "/merchants", priority: 0.9 },
  { path: "/merchants/join", priority: 0.8 },
  { path: "/mall-operators", priority: 0.9 },
  { path: "/about", priority: 0.7 },
  { path: "/contact", priority: 0.7 },
  { path: "/pricing", priority: 0.8 },
  { path: "/help", priority: 0.6 },
  { path: "/faq", priority: 0.6 },
  { path: "/malls/bbs-mall", priority: 0.6 },
  { path: "/download", priority: 0.5 },
  { path: "/waitlist", priority: 0.5 },
];
