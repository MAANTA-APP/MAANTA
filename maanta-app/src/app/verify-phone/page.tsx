import { authModeLoginHint, phoneOtpEnabled } from "@/lib/auth/strategy";
import {
  ClerkVerifyPhonePage,
  SupabaseVerifyPhonePage,
} from "./verify-phone-client";

/**
 * `/verify-phone` — the phone gate in the shopper claim flow.
 *
 * **This is a server component on purpose, and that is the whole fix for drift
 * D80.** The gate below is `phoneOtpEnabled()`, which is `isClerkAuth()`: true
 * only when *both* `MAANTA_AUTH_STRATEGY` and `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY`
 * are `clerk`. Next.js inlines only `NEXT_PUBLIC_*` into client bundles, so the
 * first of those reads as `undefined` in a browser — and this page used to be
 * `"use client"` in its entirety, which meant the gate evaluated to **false on
 * every hydration, in production included**.
 *
 * What that cost: production served the Supabase branch, whose
 * `SupabaseSignedIn` calls `supabase.auth.getSession()` on a client that
 * `createClient()` builds with the Clerk `accessToken` option — which throws
 * `Supabase Client is configured with the accessToken option, accessing
 * supabase.auth.getSession is not possible`. That is the unresolved Sentry issue
 * JAVASCRIPT-NEXTJS-4, culprit `/verify-phone`. The error was the visible
 * symptom; the real cost was that the Clerk phone-OTP flow never rendered at
 * all, on the surface a shopper must pass to claim a deal.
 *
 * The both-vars rule is preserved exactly rather than relaxed. Deciding here,
 * where both variables are readable, is what makes it enforceable — a client
 * component cannot check a server-only variable, so it must not try. Anything
 * downstream that needs the resolved strategy receives it as a prop.
 *
 * `isClerkAuthClient()` is intentionally no longer part of the condition: it is
 * subsumed, since `isClerkAuth()` already requires the public var to be `clerk`.
 */
export default function VerifyPhonePage() {
  if (!phoneOtpEnabled()) {
    return <SupabaseVerifyPhonePage loginHint={authModeLoginHint()} />;
  }
  return <ClerkVerifyPhonePage />;
}
