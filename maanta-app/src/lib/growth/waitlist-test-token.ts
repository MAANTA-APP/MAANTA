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
 *
 * ## Why a short token is the same as no token
 *
 * The comparison being constant-time protects against a timing oracle, not
 * against enumeration. A token short enough to guess needs no side channel —
 * and the endpoint it guards is public, rate-limited per address rather than
 * per guess, and answers with a visible banner. So a configured value below the
 * floor is treated exactly like an unset one: nothing can mark itself as a
 * test, and the server log says why once (never the value).
 */

/** Fewest characters `WAITLIST_TEST_TOKEN` may have and still be honoured. */
export const WAITLIST_TEST_TOKEN_MIN_LENGTH = 32;

let warnedTooShort = false;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function configuredSecret(): string | null {
  const secret = process.env.WAITLIST_TEST_TOKEN?.trim();
  if (!secret) return null;
  if (secret.length < WAITLIST_TEST_TOKEN_MIN_LENGTH) {
    if (!warnedTooShort) {
      warnedTooShort = true;
      console.error(
        `waitlist: WAITLIST_TEST_TOKEN is shorter than ${WAITLIST_TEST_TOKEN_MIN_LENGTH} characters and is being ignored — no submission can be marked as a test until it is rotated`
      );
    }
    return null;
  }
  return secret;
}

/**
 * `true` only when a real token is configured AND the offered value matches it.
 *
 * Fails closed: with no `WAITLIST_TEST_TOKEN` set (or one below the floor), no
 * submission can mark itself as a test. That is the safe direction — an
 * unmarked test row is visible noise in the real population that a human
 * notices, whereas a real signup wrongly marked test disappears from every
 * count silently.
 */
export function isWaitlistTestToken(offered: unknown): boolean {
  const secret = configuredSecret();
  if (!secret) return false;
  if (typeof offered !== "string" || !offered) return false;
  return timingSafeEqual(digest(offered), digest(secret));
}
