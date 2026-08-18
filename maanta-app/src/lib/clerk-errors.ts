import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

/**
 * Turn a Clerk send-code failure into something the person can act on.
 *
 * Every failure on `/verify-phone` used to read "Couldn't send the code. Check
 * the number and try again." — the same sentence whether the number was
 * malformed, already attached to another account, refused by the instance's SMS
 * country rules, or rate-limited. Only one of those is fixed by checking the
 * number, so the copy was wrong three times out of four and left the person
 * re-typing digits that were never the problem.
 *
 * Codes are mapped rather than Clerk's raw `longMessage` being echoed: provider
 * strings change without notice and are written for a different context. The
 * unmapped case keeps an honest generic line AND surfaces the code, in the
 * message and in the console, so a failure of a kind not seen before is
 * diagnosable instead of invisible.
 *
 * `form_identifier_exists` is deliberately specific even though naming it tells
 * the person that number exists somewhere in the system. That is a weak
 * enumeration signal — the caller is already signed in to reach this screen —
 * and the alternative is retrying a number that can never work, which is the
 * dead end this function exists to remove.
 *
 * Lives in `lib` rather than beside the screen because Next.js allows only its
 * own known exports from a `page.tsx`; a helper exported from one fails
 * `next build` with a TS2344 on the generated route types.
 */
export function clerkSendCodeMessage(err: unknown): string {
  if (!isClerkAPIResponseError(err)) {
    return "Couldn't send the code. Check your connection and try again.";
  }
  const e = err.errors?.[0];
  switch (e?.code) {
    case "form_identifier_exists":
      return "That number is already on another Maanta account. Sign in with it, or use a different number.";
    case "form_param_format_invalid":
    case "form_param_value_invalid":
      return "That number isn't in a format we can text. Include the country code and drop any leading zero.";
    case "too_many_requests":
    case "rate_limit_exceeded":
      return "Too many attempts. Wait a minute, then try again.";
    case "session_reverification_required":
      // Clerk protects createPhoneNumber/prepareVerification behind a session
      // freshness check. The screen wraps those calls in useReverification, so
      // normally the re-confirm modal opens and this code never reaches the
      // catch — this mapping is the backstop for any path where it still does
      // (the modal failed to mount, an unwrapped call). Blaming the number or
      // the country here is wrong: neither was ever looked at.
      return "For security, Maanta needs you to confirm it's you before adding a phone. If no prompt appears, sign out, sign back in, and try again.";
    default:
      // Country restrictions, SMS quota and provider outages all land here and
      // are indistinguishable from the client — the code is the only handle on
      // which one it was.
      console.error("verify-phone: Clerk refused to send", {
        code: e?.code,
        message: e?.message,
      });
      return `Couldn't send the code${e?.code ? ` (${e.code})` : ""}. This can be the number, or SMS to that country not being enabled on this account.`;
  }
}
