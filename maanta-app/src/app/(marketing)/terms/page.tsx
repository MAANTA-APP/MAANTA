import type { Metadata } from "next";
import { LegalDoc } from "@/components/marketing/LegalDoc";
import { loadLegalDoc, LEGAL_TITLES } from "@/lib/marketing/legal-docs";
import { DEMO_MODE } from "@/lib/marketing/demo";

/**
 * `/terms` — unreviewed draft, rendered from `src/content/legal/`.
 *
 * `noindex` while `DEMO_MODE` is true. A draft legal document indexed by Google
 * is a liability that outlives the draft, and search engines keep serving a
 * cached copy long after the page changes. Paired with a `robots.txt` disallow,
 * because the two mechanisms fail differently — one stops a crawl, the other
 * stops indexing of a page reached from a shared link.
 */

export const metadata: Metadata = {
  title: "Terms of Service — MAANTA",
  description: "The terms on which shoppers use MAANTA to claim and redeem in-mall deals.",
  robots: DEMO_MODE ? { index: false, follow: false } : undefined,
};

export default function Page() {
  return <LegalDoc title={LEGAL_TITLES["terms"]} markdown={loadLegalDoc("terms")} />;
}
