import type { Metadata } from "next";

/**
 * One builder for every marketing page's `Metadata`.
 *
 * ## The bug this exists to fix
 *
 * In the App Router a page-level `openGraph` object **replaces** the parent's
 * wholesale — it does not merge field by field. So the five pages that declared
 * their own `openGraph` to get a better social title (`/`, `/shoppers`,
 * `/merchants`, `/mall-operators`, `/about`) silently discarded the root layout's
 * `url`, `siteName`, `locale` and `type`. The richest pages on the site were the
 * only ones shipping an incomplete card, which is the opposite of what anyone
 * intended and is invisible unless you diff two pages' rendered `<head>`.
 *
 * The pages that *didn't* declare one had the mirror-image problem: they
 * inherited the root's `openGraph.url`, which is the bare origin, so sharing
 * `/faq` or `/privacy` unfurled as the homepage.
 *
 * Both halves come from one cause, so both are fixed in one place: every
 * marketing page builds its metadata here, and `url` is always its own path.
 *
 * ## Why the paths are relative
 *
 * `alternates.canonical` and `openGraph.url` are passed through as given, and
 * Next resolves a relative value against `metadataBase` from the root layout
 * (`src/app/layout.tsx`). Passing a path rather than an absolute URL means this
 * module never needs its own copy of the origin — so a preview deployment cannot
 * end up emitting canonicals that point at production, which is exactly what a
 * second hardcoded origin here would eventually cause.
 *
 * Passing `"/"` for the home page resolves to `https://www.maanta.app` with **no**
 * trailing slash — Next normalises it — which is byte-identical to what
 * `sitemap.ts` lists for the same route. Verified in built HTML, not assumed:
 * `scripts/check-canonicals.mjs` compares each page's canonical against that
 * page's own `<loc>` in the generated sitemap, so the two agreeing is enforced
 * rather than coincidental.
 *
 * ## OG title and description
 *
 * `ogTitle` / `ogDescription` are optional and default to `title` / `description`.
 * Use them when the social card wants a different register from the search
 * result — but each must stand on its own. They are **not** two halves of one
 * sentence: `/mall-operators` shipped `og:title` "Your mall runs hundreds of
 * promotions a month." with `og:description` "None of them are measured.", which
 * is the H1 cut at the full stop and reads as a truncation bug in a Slack unfurl.
 */

/** Fields every marketing card carries. Spread first, so a caller can override. */
const OG_BASE = {
  type: "website",
  siteName: "MAANTA",
  locale: "en_KE",
} as const;

export type PageMetadataInput = {
  /** Route path, leading slash, no origin — e.g. `/shoppers`, or `/` for home. */
  path: string;
  title: string;
  description: string;
  /** Social-card title. Defaults to `title`. Must stand alone. */
  ogTitle?: string;
  /** Social-card description. Defaults to `description`. Must be a sentence. */
  ogDescription?: string;
  /** Passed straight through — used by the legal routes while `DEMO_MODE`. */
  robots?: Metadata["robots"];
};

export function pageMetadata({
  path,
  title,
  description,
  ogTitle,
  ogDescription,
  robots,
}: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      ...OG_BASE,
      url: path,
      title: ogTitle ?? title,
      description: ogDescription ?? description,
    },
    ...(robots ? { robots } : {}),
  };
}
