/**
 * The origin to print into public artifacts: `robots.txt`, `sitemap.xml` and the
 * JSON-LD blocks. Those three cannot use a relative URL the way page metadata
 * can — `metadataBase` resolves `alternates.canonical`, but a sitemap `<loc>`
 * and a schema.org `url` have to be absolute in the file itself.
 *
 * `getAppOrigin()` returns null in production when `NEXT_PUBLIC_APP_URL` is
 * unset, and a sitemap full of `null` or `localhost` URLs is worse than no
 * sitemap, so the fallback is the canonical host. This used to be written out
 * at each call site; a third consumer (structured data) is what made the third
 * copy worth removing, since the whole point of the fallback is that all
 * public artifacts agree on one origin.
 */
export const CANONICAL_PUBLIC_ORIGIN = "https://www.maanta.app";

export function publicOrigin(): string {
  return getAppOrigin() ?? CANONICAL_PUBLIC_ORIGIN;
}

/** Canonical public app origin for redirect URLs (Stripe, etc.). */
export function getAppOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return null;
}
