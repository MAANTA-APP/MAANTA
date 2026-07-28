/**
 * Auth strategy toggle — dev/test vs launch.
 *
 *   clerk    — production launch (Clerk email + phone OTP, global E.164 UI)
 *   supabase — dev/staging email-first via Supabase Auth (no Clerk SMS cost)
 *   authjs   — reserved alias; not implemented yet (falls back to supabase)
 *
 * Server code reads MAANTA_AUTH_STRATEGY; client UI reads
 * NEXT_PUBLIC_MAANTA_AUTH_STRATEGY (same values). Defaults to supabase so
 * production uses email OTP until Clerk SMS is enabled for launch.
 */

export type AuthStrategy = "clerk" | "supabase" | "authjs";

export const AUTH_STRATEGIES: readonly AuthStrategy[] = [
  "clerk",
  "supabase",
  "authjs",
] as const;

const DEFAULT_AUTH_STRATEGY: AuthStrategy = "supabase";

function readStrategy(raw: string | undefined): AuthStrategy {
  const value = raw?.trim().toLowerCase();
  if (value === "clerk") return "clerk";
  if (value === "supabase" || value === "authjs") return value;
  return DEFAULT_AUTH_STRATEGY;
}

/** Active strategy on the server (MAANTA_AUTH_STRATEGY → public mirror → clerk). */
export function authStrategy(): AuthStrategy {
  return readStrategy(
    process.env.MAANTA_AUTH_STRATEGY ?? process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY
  );
}

/** Client-side strategy (NEXT_PUBLIC_MAANTA_AUTH_STRATEGY only). */
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
  return "Enter your email — we'll send a one-time code. New here? We'll create your account.";
}
