/**
 * Browser-safe auth-strategy predicates — the only strategy module a
 * `"use client"` component may import.
 *
 * Everything here answers from `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY`, which Next
 * inlines at build time and is therefore the only strategy signal the browser
 * has. The server-side predicates live in `./strategy`, which also re-exports
 * these for server callers — imports flow server→client-safe, never the other
 * way, so this module can never drag `MAANTA_AUTH_STRATEGY` readers into a
 * bundle.
 *
 * The split exists because the two kinds shared one file and `/verify-phone`
 * branched on the wrong one: `phoneOtpEnabled()` reads the un-inlined server
 * var, silently returns false in every browser, and the page hydrated into the
 * Supabase branch on a Clerk build — `supabase.auth.getSession()` on an
 * `accessToken`-configured client throws (Sentry JAVASCRIPT-NEXTJS-4, drift
 * D70). `auth-strategy-boundary.test.ts` now walks the import graph from every
 * client entry and fails if `./strategy` is reachable at all.
 */

export type AuthStrategy = "clerk" | "supabase" | "authjs";

export const AUTH_STRATEGIES: readonly AuthStrategy[] = [
  "clerk",
  "supabase",
  "authjs",
] as const;

/** Default when env is unset — Supabase email OTP (not Clerk). */
export const DEFAULT_AUTH_STRATEGY: AuthStrategy = "supabase";

export function readStrategy(raw: string | undefined): AuthStrategy {
  const value = raw?.trim().toLowerCase();
  if (value === "clerk") return "clerk";
  if (value === "supabase") return "supabase";
  if (value === "authjs") return "authjs";
  return DEFAULT_AUTH_STRATEGY;
}

function explicitClientStrategy(): AuthStrategy | null {
  const raw = process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "clerk" || raw === "supabase" || raw === "authjs") return raw;
  return null;
}

/** Client-side strategy (NEXT_PUBLIC only — set at Vercel build time). */
export function authStrategyClient(): AuthStrategy {
  return readStrategy(process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY);
}

/** Client bundle: Clerk UI only when NEXT_PUBLIC is explicitly `clerk`. */
export function isClerkAuthClient(): boolean {
  return explicitClientStrategy() === "clerk";
}

export function isSupabaseAuthClient(): boolean {
  const s = authStrategyClient();
  return s === "supabase" || s === "authjs";
}

/**
 * Browser-safe "is Clerk SMS phone OTP live".
 *
 * A build where the public var says `clerk` but the server var does not is
 * already broken server-side — middleware would not run Clerk — so treating the
 * public var as the answer here does not paper over a real mismatch, it just
 * stops the client silently disagreeing with its own SSR.
 */
export function phoneOtpEnabledClient(): boolean {
  return isClerkAuthClient();
}

/** Browser-safe login hint for /login and /verify-phone. */
export function authModeLoginHintClient(): string {
  return loginHintFor(isClerkAuthClient());
}

export function loginHintFor(clerk: boolean): string {
  if (clerk) {
    return "Sign in with email or phone. Phone OTP is required to claim deals.";
  }
  return "For now, please use email to sign in; phone OTP will be enabled for launch.";
}
