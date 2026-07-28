/**
 * Auth strategy toggle — rehearsal vs launch.
 *
 *   supabase — default: email OTP via Supabase Auth (production rehearsal)
 *   clerk    — launch only when MAANTA_AUTH_STRATEGY=clerk (email + phone OTP)
 *   authjs   — reserved alias; behaves like supabase until Auth.js is wired
 *
 * Server reads MAANTA_AUTH_STRATEGY (falls back to NEXT_PUBLIC mirror).
 * Client reads NEXT_PUBLIC_MAANTA_AUTH_STRATEGY (inlined at build time).
 * Both must be set to `clerk` for Clerk launch; unset or `supabase` → Supabase UI.
 */

export type AuthStrategy = "clerk" | "supabase" | "authjs";

export const AUTH_STRATEGIES: readonly AuthStrategy[] = [
  "clerk",
  "supabase",
  "authjs",
] as const;

/** Default when env is unset — Supabase email OTP (not Clerk). */
export const DEFAULT_AUTH_STRATEGY: AuthStrategy = "supabase";

function readStrategy(raw: string | undefined): AuthStrategy {
  const value = raw?.trim().toLowerCase();
  if (value === "clerk") return "clerk";
  if (value === "supabase") return "supabase";
  if (value === "authjs") return "authjs";
  return DEFAULT_AUTH_STRATEGY;
}

/** Active strategy on the server (MAANTA_AUTH_STRATEGY → public mirror → supabase). */
export function authStrategy(): AuthStrategy {
  return readStrategy(
    process.env.MAANTA_AUTH_STRATEGY ?? process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY
  );
}

/** Client-side strategy (NEXT_PUBLIC only — set at Vercel build time). */
export function authStrategyClient(): AuthStrategy {
  return readStrategy(process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY);
}

export function isClerkAuth(): boolean {
  return authStrategy() === "clerk";
}

export function isSupabaseAuth(): boolean {
  const s = authStrategy();
  return s === "supabase" || s === "authjs";
}

export function isAuthJsAuth(): boolean {
  return authStrategy() === "authjs";
}

export function isClerkAuthClient(): boolean {
  return authStrategyClient() === "clerk";
}

export function isSupabaseAuthClient(): boolean {
  const s = authStrategyClient();
  return s === "supabase" || s === "authjs";
}

/**
 * Clerk SMS phone OTP for sign-in and /verify-phone. Launch-only — disabled in
 * dev/test Supabase Auth mode to avoid Clerk SMS charges during rehearsal.
 */
export function phoneOtpEnabled(): boolean {
  return isClerkAuth();
}

/** Human-readable login hint for /login and /verify-phone. */
export function authModeLoginHint(): string {
  if (isClerkAuth()) {
    return "Sign in with email or phone. Phone OTP is required to claim deals.";
  }
  return "For now, please use email to sign in; phone OTP will be enabled for launch.";
}
