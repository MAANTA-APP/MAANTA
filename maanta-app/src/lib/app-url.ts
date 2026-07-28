/** Canonical public production origin (email auth redirects, Stripe, etc.). */
export const PRODUCTION_APP_ORIGIN = "https://www.maanta.app";

/**
 * Canonical public app origin for redirect URLs (Supabase emailRedirectTo,
 * Stripe checkout, auth callback).
 *
 * Production never falls back to localhost — even if `NEXT_PUBLIC_APP_URL` is
 * missing or mis-set to a loopback host.
 */
export function getAppOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const origin = configured.replace(/\/$/, "");
    if (
      process.env.NODE_ENV === "production" &&
      isLoopbackOrigin(origin)
    ) {
      return PRODUCTION_APP_ORIGIN;
    }
    return origin;
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return PRODUCTION_APP_ORIGIN;
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return /localhost|127\.0\.0\.1/i.test(origin);
  }
}

/** Absolute URL for Supabase Auth email / magic-link redirects. */
export function getAuthEmailRedirectTo(next = "/select-mall"): string {
  const origin = getAppOrigin() ?? PRODUCTION_APP_ORIGIN;
  const path = next.startsWith("/") ? next : `/${next}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(path)}`;
}
