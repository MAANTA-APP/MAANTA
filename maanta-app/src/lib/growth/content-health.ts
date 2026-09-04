import { NON_INDEXABLE_PREFIXES, SITEMAP_ROUTES } from "@/lib/marketing/nav";
import { LEGAL_TITLES, type LegalSlug } from "@/lib/marketing/legal-docs";

/**
 * Content & SEO health for `/admin/growth/content`.
 *
 * This screen deliberately computes almost nothing of its own. The crawl policy
 * already exists in `lib/marketing/nav.ts` as two halves of one rule
 * (`SITEMAP_ROUTES` and `NON_INDEXABLE_PREFIXES`), and `marketing-crawl-policy.test.ts`
 * already asserts every route is covered by one of them. Re-deriving any of that
 * here would be the third opinion about the same question — which is exactly how
 * `/feed` ended up excluded from discovery and open to crawling at the same time.
 *
 * So the screen is a **read-only window onto the policy in code**, and it says so.
 * The one thing it adds is the join: which indexable route has an OG card.
 */

/**
 * Marketing routes that ship their own `opengraph-image.tsx`.
 *
 * Declared rather than discovered: `next/og` routes are build artifacts and a
 * runtime filesystem walk is not available in a deployed Next build. It cannot
 * drift, because `growth-content-health.test.ts` walks `src/app/(marketing)` and
 * fails if this list and the files on disk disagree in either direction.
 *
 * OG images do **not** cascade in the App Router — a child route without its own
 * file gets no large card at all, not its parent's — which is why coverage is
 * worth a row on this screen rather than being assumed from the root.
 */
export const ROUTES_WITH_OG_IMAGE: readonly string[] = [
  "/",
  "/about",
  "/contact",
  "/download",
  "/faq",
  "/help",
  "/malls/bbs-mall",
  "/mall-operators",
  "/merchants",
  "/merchants/join",
  "/pricing",
  "/shoppers",
  "/waitlist",
];

export const LEGAL_ROUTES: readonly `/${LegalSlug}`[] = (
  Object.keys(LEGAL_TITLES) as LegalSlug[]
).map((slug) => `/${slug}` as const);

export type IndexPolicy = "index" | "noindex" | "disallowed";

export type RouteHealth = {
  path: string;
  priority: number | null;
  hasOgImage: boolean | null;
  policy: IndexPolicy;
  /** Why this route carries the policy it does — shown, never inferred by eye. */
  note: string;
};

/**
 * Every route the crawl policy has an opinion about, in one table.
 *
 * Three populations, and the screen keeps them visibly distinct:
 *  - **index** — in `SITEMAP_ROUTES`, advertised and crawlable.
 *  - **noindex** — the four legal drafts. Deliberately *not* disallowed (founder
 *    ruling 2026-08-01): a disallow stops the crawl that would read the
 *    `noindex`, so the two work against each other. They stay out of the sitemap
 *    instead, which agrees with the meta tag rather than contradicting it.
 *  - **disallowed** — the operational and shopper-session prefixes in
 *    `robots.txt`.
 */
export function routeHealth(): RouteHealth[] {
  const indexable: RouteHealth[] = SITEMAP_ROUTES.map((r) => ({
    path: r.path,
    priority: r.priority,
    hasOgImage: ROUTES_WITH_OG_IMAGE.includes(r.path),
    policy: "index" as const,
    note: "In the sitemap at this priority.",
  }));

  const legal: RouteHealth[] = LEGAL_ROUTES.map((path) => ({
    path,
    priority: null,
    // Legal routes carry no OG card by design — there is nothing to advertise on
    // an unreviewed draft — so this is "not applicable", not "missing".
    hasOgImage: null,
    policy: "noindex" as const,
    note: "Unreviewed draft: noindex, absent from the sitemap, deliberately crawlable.",
  }));

  const disallowed: RouteHealth[] = [...NON_INDEXABLE_PREFIXES].map((prefix) => ({
    path: prefix,
    priority: null,
    hasOgImage: null,
    policy: "disallowed" as const,
    note: "Disallowed in robots.txt — operational or session surface.",
  }));

  return [...indexable, ...legal, ...disallowed];
}

export type ContentHealthSummary = {
  indexableRoutes: number;
  legalDraftsNoindex: number;
  disallowedPrefixes: number;
  ogCovered: number;
  ogExpected: number;
  /** Indexable routes shipping no OG card — each one is a share that renders bare. */
  missingOg: string[];
};

export function contentHealthSummary(): ContentHealthSummary {
  const missingOg = SITEMAP_ROUTES.filter((r) => !ROUTES_WITH_OG_IMAGE.includes(r.path)).map(
    (r) => r.path
  );
  return {
    indexableRoutes: SITEMAP_ROUTES.length,
    legalDraftsNoindex: LEGAL_ROUTES.length,
    disallowedPrefixes: NON_INDEXABLE_PREFIXES.length,
    ogCovered: SITEMAP_ROUTES.length - missingOg.length,
    ogExpected: SITEMAP_ROUTES.length,
    missingOg,
  };
}

/**
 * The claims guard, as an inventory — not a live re-scan.
 *
 * The design board draws this panel as a list of counts, each zero. Rendering a
 * live zero here would be a lie of a specific and dangerous kind: these guards
 * scan **`.tsx` source**, and source is not on disk in a deployed build, so a
 * request-time scan would find nothing to scan and report a perfect score for
 * that reason alone. A green light whose green means "I could not look" is worse
 * than no light — it is the exact failure `check-tokens.mjs` and
 * `check-server-forms.mjs` were added to prevent after a source-only guard passed
 * a page whose form never reached the server HTML (D41).
 *
 * So the panel states what each guard forbids and where it runs. The check is
 * CI, and CI blocks the merge; this screen is the operator's index of it.
 */
export type ClaimsGuard = {
  forbids: string;
  guard: string;
  /** Where the guard actually executes. */
  runsIn: "vitest" | "build";
};

export const CLAIMS_GUARDS: readonly ClaimsGuard[] = [
  {
    forbids: "“Live at” wording, or a live status dot, on any pre-launch surface",
    guard: "held-claims.test.ts",
    runsIn: "vitest",
  },
  {
    forbids: "A numeric Elite monthly price anywhere in app, components or legal copy",
    guard: "pricing-copy.test.ts",
    runsIn: "vitest",
  },
  {
    forbids: "A second declaration of the frozen KES 30 success fee",
    guard: "success-fee-copy.test.ts",
    runsIn: "vitest",
  },
  {
    forbids: "A route that is neither in the sitemap, legal, nor covered by a robots rule",
    guard: "marketing-crawl-policy.test.ts",
    runsIn: "vitest",
  },
  {
    // Described, not spelled: writing the literal brace form here would put a
    // real unfilled token into rendered output, and check:tokens would fail
    // the build on this very list. It did, on the first run.
    forbids: "An unfilled copy-template token reaching rendered output",
    guard: "check:tokens",
    runsIn: "build",
  },
  {
    forbids: "A canonical or og:url disagreeing with the generated sitemap",
    guard: "check:canonicals",
    runsIn: "build",
  },
  {
    forbids: "A prerendered route shipping no server-rendered <form>",
    guard: "check:forms",
    runsIn: "build",
  },
];
