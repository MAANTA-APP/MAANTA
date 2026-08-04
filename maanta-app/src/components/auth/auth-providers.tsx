"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { isClerkAuthClient } from "@/lib/auth/strategy-client";

type Props = {
  children: React.ReactNode;
};

/**
 * Wraps ClerkProvider only when MAANTA_AUTH_STRATEGY=clerk (launch).
 * Dev/test supabase strategy skips Clerk so rehearsal does not need Clerk keys.
 */
export function AuthProviders({ children }: Props) {
  if (!isClerkAuthClient()) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/login"}
      signUpUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? "/sign-up"}
      signInFallbackRedirectUrl={
        process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL ??
        "/app-bootstrap"
      }
      signUpFallbackRedirectUrl={
        process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL ??
        "/app-bootstrap"
      }
    >
      {children}
    </ClerkProvider>
  );
}
