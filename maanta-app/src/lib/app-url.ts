/** Canonical public app origin for redirect URLs (Stripe, etc.). */
export function getAppOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return null;
}
