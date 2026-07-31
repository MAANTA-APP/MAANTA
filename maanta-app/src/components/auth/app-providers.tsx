"use client";

import { AuthProviders } from "@/components/auth/auth-providers";
import { PostHogIdentitySync } from "@/components/posthog-provider";

/**
 * Providers for routes that authenticate someone.
 *
 * Mounted by each authenticated shell rather than by the root layout, so the
 * Clerk client SDK is never shipped to a marketing page. Before this, the root
 * layout wrapped everything: a visitor reading `/shoppers` downloaded and
 * initialised Clerk to read a page with no login on it, and first-load JS was
 * 248–262 kB against 1.3–3.4 kB of actual page code.
 *
 * Two things travel together here on purpose. `PostHogIdentitySync` calls
 * `useUser()` under the Clerk strategy, so it must sit inside `AuthProviders` —
 * keeping them in one component means a shell cannot mount analytics identity
 * without the provider it depends on, which is the failure that made the original
 * root-level wrapping look necessary.
 *
 * Anonymous analytics is unaffected: `PostHogClientProvider` stays in the root
 * layout and captures pageviews and marketing events on every route.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProviders>
      <PostHogIdentitySync />
      {children}
    </AuthProviders>
  );
}
