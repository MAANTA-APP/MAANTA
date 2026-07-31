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

export const HEADER_CTA = { label: "Browse deals", href: "/feed" } as const;

/**
 * Footer columns 2–4. Column 1 (brand) and column 5 (contact) are structural
 * rather than link lists, so `SiteFooter` composes them directly.
 *
 * Resources points at `/faq`, not `/help`. `/help` renders inside the *app*
 * shell (Feed/Browse/Map/Deals/You tab bar), so a marketing footer link would
 * drop the visitor into different chrome mid-journey — risk R9. The footer plan
 * offers two fixes; until `/help` is rehomed, `/faq` is the one that does not
 * ship the jarring version.
 */
export const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Shoppers", href: "/shoppers" },
      { label: "Merchants", href: "/merchants" },
      { label: "Mall operators", href: "/mall-operators" },
      { label: "Pricing", href: "/pricing" },
      { label: "Browse deals", href: "/feed" },
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
      { label: "FAQ", href: "/faq" },
      { label: "BBS Mall (Node 0)", href: "/malls/bbs-mall" },
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
export const SITEMAP_ROUTES: ReadonlyArray<{ path: string; priority: number }> = [
  { path: "/", priority: 1.0 },
  { path: "/shoppers", priority: 0.9 },
  { path: "/merchants", priority: 0.9 },
  { path: "/merchants/join", priority: 0.8 },
  { path: "/mall-operators", priority: 0.9 },
  { path: "/about", priority: 0.7 },
  { path: "/contact", priority: 0.7 },
  { path: "/pricing", priority: 0.8 },
  { path: "/faq", priority: 0.6 },
  { path: "/malls/bbs-mall", priority: 0.6 },
  { path: "/download", priority: 0.5 },
  { path: "/waitlist", priority: 0.5 },
];
