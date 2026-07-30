/**
 * Auth strategy toggle — rehearsal vs launch.
 *
 *   supabase — default: email OTP via Supabase Auth (production rehearsal)
 *   clerk    — launch only when BOTH env vars are explicitly `clerk`
 *   authjs   — reserved alias; behaves like supabase until Auth.js is wired
 *
 * Server reads MAANTA_AUTH_STRATEGY; client reads NEXT_PUBLIC_MAANTA_AUTH_STRATEGY
 * (inlined at build time). Clerk mode requires both to be explicitly `clerk` —
 * partial or mismatched values always fall back to Supabase UI.
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

/** Client-side strategy (NEXT_PUBLIC only — set at Vercel build time). */
export function authStrategyClient(): AuthStrategy {
  return readStrategy(process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY);
}

export function isSupabaseAuth(): boolean {
  const s = authStrategy();
  return s === "supabase" || s === "authjs";
}

export function isAuthJsAuth(): boolean {
  return authStrategy() === "authjs";
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
