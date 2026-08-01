import { readFileSync } from "node:fs";
import path from "node:path";
import { ENTITY, LEGAL_LAST_UPDATED, PLACEHOLDER_IDS } from "@/lib/marketing/demo";
import { FACTS } from "@/lib/marketing/facts";

/**
 * Legal document loading and token resolution.
 *
 * The four documents live as markdown in `src/content/legal/`, not as hand-built
 * JSX. The footer plan asks for exactly this — "content authored as MDX or
 * structured data … so non-engineers can revise it" — and it means counsel can be
 * sent a markdown file rather than a React component.
 *
 * The drafting preamble in `docs/legal/*.md` (status block, the draft banner, and
 * the "decision this document is waiting on" advisory sections) is **not** page
 * content. It is instruction to the implementer, and it was dropped when the
 * files were extracted. The banner it describes is rendered by
 * `LegalDraftBanner` instead, from one source, on all four routes.
 */

export type LegalSlug = "privacy" | "terms" | "merchant-terms" | "cookies";

const FILES: Record<LegalSlug, string> = {
  privacy: "privacy-policy.md",
  terms: "terms-of-service.md",
  "merchant-terms": "merchant-terms.md",
  cookies: "cookie-notice.md",
};

export const LEGAL_TITLES: Record<LegalSlug, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  "merchant-terms": "Merchant Terms",
  cookies: "Cookie & Tracking Notice",
};

/**
 * Tokens this build can answer, and where the answer came from.
 *
 * Everything here was resolved by reading the repo or the live infrastructure in
 * Phase 0 — none of it is a guess. Tokens owned by counsel or by a pending
 * product decision are deliberately absent: they render as a visible
 * "to be confirmed" marker rather than being filled with something plausible,
 * because a fabricated retention period or liability cap in a document that looks
 * like a contract is worse than an obvious gap.
 */
export const RESOLVED_TOKENS: Record<string, string> = {
  // Verified against the live Supabase project (eu-west-1, read 2026-07-31).
  SUPABASE_REGION: "the EU (Ireland)",
  // api.resend.com, no region pinning configured.
  RESEND_REGION: "the United States",
  // Resolved from the migrations in Phase 0.
  STAFF_PLAN_AVAILABILITY: "on all plans",
  BOOST_PLAN_AVAILABILITY: "on Elite only",
  BOOST_FEE: `KES ${FACTS.boostPer24hKes.toLocaleString("en-KE")}`,
  SUCCESS_FEE: `KES ${FACTS.successFeeKes.toLocaleString("en-KE")}`,
  GRACE_MINUTES: String(FACTS.graceMinutes),
  ENTITY_NAME: ENTITY.name,
  ENTITY_ADDRESS: `${ENTITY.address}, ${ENTITY.city}, ${ENTITY.country}`,
  SUPPORT_EMAIL: ENTITY.email,
  PRIVACY_EMAIL: ENTITY.email,
  ODPC_REGISTRATION: PLACEHOLDER_IDS.odpc,
  COMPANY_REGISTRATION: PLACEHOLDER_IDS.company,
  PIN: PLACEHOLDER_IDS.pin,
  lastUpdated: LEGAL_LAST_UPDATED,
};

/**
 * Who owns each unresolved token, surfaced in the marker so a reader — and the
 * auditor — can see it is waiting on a decision rather than forgotten.
 */
export const TOKEN_OWNERS: Record<string, string> = {
  CLERK_REGION: "engineering",
  SENTRY_REGION: "engineering",
  AUTH_COOKIE_LIFETIME: "engineering",
};

export function loadLegalDoc(slug: LegalSlug): string {
  const file = path.join(process.cwd(), "src", "content", "legal", FILES[slug]);
  return readFileSync(file, "utf8");
}

/** Every token still unresolved in a document, for the implementation report. */
export function unresolvedTokens(markdown: string): string[] {
  const found = markdown.match(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g) ?? [];
  const names = found.map((t) => t.replace(/[{}\s]/g, ""));
  return Array.from(new Set(names)).filter((t) => !(t in RESOLVED_TOKENS));
}
