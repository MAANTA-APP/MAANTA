/**
 * Auth strategy toggle — rehearsal vs launch. **Server-only module.**
 *
 *   supabase — default: email OTP via Supabase Auth (production rehearsal)
 *   clerk    — launch only when BOTH env vars are explicitly `clerk`
 *   authjs   — reserved alias; behaves like supabase until Auth.js is wired
 *
 * Server reads MAANTA_AUTH_STRATEGY; client reads NEXT_PUBLIC_MAANTA_AUTH_STRATEGY
 * (inlined at build time). Clerk mode requires both to be explicitly `clerk` —
 * partial or mismatched values always fall back to Supabase UI.
 *
 * ## Why this module must never reach a client bundle
 *
 * `MAANTA_AUTH_STRATEGY` has no `NEXT_PUBLIC_` prefix, so Next.js does **not**
 * inline it. In client code it reads `undefined`, which makes every predicate
 * below return its non-Clerk answer **regardless of how production is
 * configured** — silently, since they all return plain booleans/strings.
 *
 * That is not a theoretical hazard. `/verify-phone` — a `"use client"` page —
 * branched on `phoneOtpEnabled()`: the server rendered the Clerk page, hydration
 * took the Supabase branch, and `supabase.auth.getSession()` on a client built
 * with the Clerk `accessToken` option threw, in production, on the claim path
 * (Sentry JAVASCRIPT-NEXTJS-4, drift D70).
 *
 * Browser-safe counterparts live in `./strategy-client`, which this module
 * re-exports for server callers' convenience. The dependency points one way
 * only: this file imports from `strategy-client`, never the reverse.
 * `src/lib/__tests__/auth-strategy-boundary.test.ts` enforces the boundary by
 * walking the import graph from every `"use client"` entry and failing if this
 * module is reachable at all.
 */

import {
  DEFAULT_AUTH_STRATEGY,
  loginHintFor,
  type AuthStrategy,
} from "@/lib/auth/strategy-client";

export {
  AUTH_STRATEGIES,
  DEFAULT_AUTH_STRATEGY,
  authModeLoginHintClient,
  authStrategyClient,
  isClerkAuthClient,
  isSupabaseAuthClient,
  phoneOtpEnabledClient,
  type AuthStrategy,
} from "@/lib/auth/strategy-client";

function explicitServerStrategy(): AuthStrategy | null {
  const raw = process.env.MAANTA_AUTH_STRATEGY?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "clerk" || raw === "supabase" || raw === "authjs") return raw;
  return null;
}

function explicitClientStrategy(): AuthStrategy | null {
  const raw = process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "clerk" || raw === "supabase" || raw === "authjs") return raw;
  return null;
}

/** True only when both server and public env vars are explicitly `clerk`. */
export function isClerkAuth(): boolean {
  return (
    explicitServerStrategy() === "clerk" && explicitClientStrategy() === "clerk"
  );
}

/**
 * Active strategy on the server. Clerk only when both vars agree; partial clerk
 * or mismatched values never enable Clerk middleware or SSR auth UI.
 */
export function authStrategy(): AuthStrategy {
  if (isClerkAuth()) return "clerk";
  const server = explicitServerStrategy();
  const client = explicitClientStrategy();
  if (server === "authjs" || client === "authjs") return "authjs";
  return DEFAULT_AUTH_STRATEGY;
}

export function isSupabaseAuth(): boolean {
  const s = authStrategy();
  return s === "supabase" || s === "authjs";
}

export function isAuthJsAuth(): boolean {
  return authStrategy() === "authjs";
}

/**
 * Clerk SMS phone OTP for sign-in and /verify-phone. Launch-only — disabled in
 * dev/test Supabase Auth mode to avoid Clerk SMS charges during rehearsal.
 *
 * **Server-only.** Client components want `phoneOtpEnabledClient()` from
 * `./strategy-client`.
 */
export function phoneOtpEnabled(): boolean {
  return isClerkAuth();
}

/**
 * Human-readable login hint for /login and /verify-phone.
 *
 * **Server-only.** Client components want `authModeLoginHintClient()` from
 * `./strategy-client` — calling this one from the browser always produced the
 * rehearsal copy on a production build where phone OTP was in fact live.
 */
export function authModeLoginHint(): string {
  return loginHintFor(isClerkAuth());
}
