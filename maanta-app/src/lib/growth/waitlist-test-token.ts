import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether a waitlist submission may mark itself as an internal TEST signup.
 *
 * ## Why this is not a boolean on the request
 *
 * Until this module existed, `validateWaitlistSubmission` took the caller's word
 * for it (`isTest: b.isTest === true`). On a public, unauthenticated endpoint
 * that means anyone who reads the JSON could file signups that the admin console
 * segregates out of its counts — or, worse, flip the sense and file test rows
 * that land in the REAL population. The moment those counts came from Supabase
 * rather than a capped Resend walk, that stopped being cosmetic.
 *
 * So trust comes from a shared secret the tester puts in the URL
 * (`/waitlist?test=<token>`), checked here against `WAITLIST_TEST_TOKEN`. A
 * member of the public cannot guess it; a field tester can be handed it once.
 *
 * ## Why both sides are hashed before comparison
 *
 * `crypto.timingSafeEqual` THROWS `RangeError` on buffers of unequal length, so
 * comparing the raw strings turns an attacker-chosen length into an
 * unauthenticated 500. Guarding with `String.length` does not fix it either —
 * that counts UTF-16 code units while the Buffer counts bytes, so a multi-byte
 * input can pass the guard and still throw.
 *
 * Hashing first makes both operands 32 bytes by construction: the comparison
 * cannot throw, stays constant-time, and the length of the offered value leaks
 * nothing.
 */

const NOT_CONFIGURED = Symbol("waitlist-test-token-unset");

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * `true` only when a real token is configured AND the offered value matches it.
 *
 * Fails closed: with no `WAITLIST_TEST_TOKEN` set, no submission can mark itself
 * as a test. That is the safe direction — an unmarked test row is visible noise
 * in the real population that a human notices, whereas a real signup wrongly
 * marked test disappears from every count silently.
 */
export function isWaitlistTestToken(offered: unknown): boolean {
  const secret = process.env.WAITLIST_TEST_TOKEN?.trim();
  if (!secret || secret === NOT_CONFIGURED.description) return false;
  if (typeof offered !== "string" || !offered) return false;
  return timingSafeEqual(digest(offered), digest(secret));
}

/** Is the treatment available at all? Drives the page's TEST badge. */
export function isWaitlistTestModeConfigured(): boolean {
  return Boolean(process.env.WAITLIST_TEST_TOKEN?.trim());
}
