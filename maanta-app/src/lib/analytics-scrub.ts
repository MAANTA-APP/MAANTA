/**
 * Strip the waitlist TEST token from anything analytics is about to send.
 *
 * `/waitlist?test=<token>` puts a shared secret in the URL. The token is checked
 * on the server and never rendered, but PostHog's autocapture records the page
 * URL on every event — `$current_url`, `$referrer`, `$initial_current_url`,
 * `$session_entry_url` and whichever names next month's SDK adds — and an
 * analytics warehouse is exactly the place a secret gets read back out of a
 * year later by someone with dashboard access and no reason to hold the token.
 *
 * This runs as PostHog's `before_send` hook, so it sees every event the SDK
 * transmits, including `$set` / `$set_once` person properties. It is
 * deliberately shape-agnostic: any string value carrying a `test=` query
 * parameter has that parameter's value redacted. It does not try to know which
 * property names carry URLs.
 *
 * Pure and dependency-free on purpose — it is imported by a client component.
 */

const TEST_PARAM = /([?&#]test=)[^&#]*/gi;
const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;

/** `…?test=abc&x=1` → `…?test=[REDACTED]&x=1`. Any other string is untouched. */
export function redactTestToken(value: string): string {
  return value.replace(TEST_PARAM, `$1${REDACTED}`);
}

function scrub(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactTestToken(value);
  if (value === null || typeof value !== "object" || depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = scrub(inner, depth + 1);
  }
  return out;
}

const SCRUBBED_KEYS = ["properties", "$set", "$set_once"] as const;

/**
 * The `before_send` hook. Returns the same event with every string under
 * `properties`, `$set` and `$set_once` redacted; `null` (a dropped event) passes
 * through untouched.
 */
export function scrubAnalyticsEvent<T extends object | null>(event: T): T {
  if (!event) return event;
  const out = { ...(event as Record<string, unknown>) };
  for (const key of SCRUBBED_KEYS) {
    if (out[key] && typeof out[key] === "object") out[key] = scrub(out[key], 0);
  }
  return out as T;
}
