import type { Metadata } from "next";
import { LegalDoc } from "@/components/marketing/LegalDoc";
import { loadLegalDoc, LEGAL_TITLES } from "@/lib/marketing/legal-docs";
import { DEMO_MODE } from "@/lib/marketing/demo";
import { pageMetadata } from "@/lib/marketing/page-metadata";

/**
 * `/merchant-terms` — unreviewed draft, rendered from `src/content/legal/`.
 *
 * `noindex` while `DEMO_MODE` is true. A draft legal document indexed by Google
 * is a liability that outlives the draft, and search engines keep serving a
 * cached copy long after the page changes. Paired with a `robots.txt` disallow,
 * because the two mechanisms fail differently — one stops a crawl, the other
 * stops indexing of a page reached from a shared link.
 */

export const metadata: Metadata = pageMetadata({
  path: "/merchant-terms",
  title: "Merchant Terms — MAANTA",
  description:
    "The commercial terms for shops listing deals on MAANTA — success fee, wallet, disputes and suspension.",
  robots: DEMO_MODE ? { index: false, follow: false } : undefined,
  // No opengraph-image for this route, and it should not have one — see
  // `twitterCard` in page-metadata.ts.
  twitterCard: "summary",
});

export default function Page() {
  return <LegalDoc title={LEGAL_TITLES["merchant-terms"]} markdown={loadLegalDoc("merchant-terms")} />;
}
