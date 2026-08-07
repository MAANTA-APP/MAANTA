/**
 * The one HTML escaper for server-built email bodies.
 *
 * Consolidated 2026-08-07 from two private copies (`lib/contact.ts` and
 * `lib/waitlist-emails.ts`) that differed by exactly one character class:
 * the waitlist copy escaped `'` and the contact copy did not. This is the
 * superset — strictly safer, and the only visible effect is that apostrophes
 * in contact-form messages now reach the inbox as `&#39;` in HTML source,
 * identical on screen. Founder-approved 2026-08-07.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
