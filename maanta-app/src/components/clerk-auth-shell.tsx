"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  SignIn,
  SignUp,
} from "@clerk/nextjs";
import {
  Body,
  HeadingLg,
  PrimaryButtonLink,
  SecondaryButtonLink,
} from "@/components/ui/claude";
import { Skeleton } from "@/components/ui/states";

/**
 * One Claude card wraps the form. Clerk Core 2 also paints `cardBox` + `card`
 * (+ footer chrome) — neutralize those so we don't get stacked boxes.
 */
const CLERK_EMBEDDED_APPEARANCE = {
  elements: {
    rootBox: "w-full",
    cardBox:
      "!w-full !max-w-none !shadow-none !border-0 !bg-transparent !rounded-none",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none !p-0",
    footer: "!bg-transparent !shadow-none !border-0 !rounded-none",
    footerAction: "!bg-transparent",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
  },
} as const;

/** Single visible card silhouette shared by loading / failed / loaded. */
const AUTH_CARD =
  "w-full max-w-md rounded-card border border-line bg-white p-5 shadow-card sm:p-6";

function hasPublishableKey(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());
}

function AuthLoading() {
  return (
    <div className={`${AUTH_CARD} space-y-4`} aria-busy="true" aria-label="Loading sign-in">
      <Skeleton className="mx-auto h-8 w-48" />
      <Skeleton className="h-10 w-full rounded-full" />
      <Skeleton className="h-10 w-full rounded-full" />
      <Skeleton className="h-40 w-full rounded-card" />
    </div>
  );
}

function AuthFailed({ mode }: { mode: "sign-in" | "sign-up" }) {
  const missingKey = !hasPublishableKey();
  return (
    <div className={`${AUTH_CARD} text-center`}>
      <HeadingLg as="h1" className="text-[1.35rem]">
        {mode === "sign-up" ? "Couldn’t load sign-up" : "Couldn’t load sign-in"}
      </HeadingLg>
      <Body className="mt-2">
        {missingKey
          ? "Sign-in isn’t configured for this deployment. The team needs to set the Clerk publishable key and redeploy."
          : "Check your connection and try again. If this keeps happening, Clerk may be blocked or misconfigured for this domain."}
      </Body>
      <div className="mt-6 flex flex-col gap-3">
        <PrimaryButtonLink href={mode === "sign-up" ? "/sign-up" : "/login"} full>
          Try again
        </PrimaryButtonLink>
        <SecondaryButtonLink href="/feed" full>
          Browse deals
        </SecondaryButtonLink>
      </div>
    </div>
  );
}

/** Wraps Clerk-hosted sign-in/up with loading + failure UI so a blocked Clerk script never leaves a blank page. */
export function ClerkAuthShell({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="w-full max-w-md">
      <div className="mb-5 text-center">
        <HeadingLg as="h1" className="text-[1.5rem]">
          {mode === "sign-up" ? "Sign up" : "Sign in"}
        </HeadingLg>
        <Body className="mt-1.5">
          {mode === "sign-up"
            ? "Create a Maanta account to claim deals at your mall."
            : "Enter your phone number in international format (e.g. +44…, +47…, +254…). You’ll receive a one-time code by SMS, or sign in with email."}
        </Body>
        <Body className="mt-2 text-xs text-muted">
          <a href="/help/phone-login" className="font-semibold text-ink underline">
            How phone login works
          </a>
        </Body>
      </div>

      <ClerkLoading>
        <AuthLoading />
      </ClerkLoading>
      <ClerkFailed>
        <AuthFailed mode={mode} />
      </ClerkFailed>
      <ClerkLoaded>
        {/* Layout frame heading above; this is the only card chrome. */}
        <div className={AUTH_CARD} data-testid="auth-card">
          {mode === "sign-up" ? (
            <SignUp
              routing="path"
              path="/sign-up"
              signInUrl="/login"
              appearance={CLERK_EMBEDDED_APPEARANCE}
            />
          ) : (
            <SignIn
              routing="path"
              path="/login"
              signUpUrl="/sign-up"
              appearance={CLERK_EMBEDDED_APPEARANCE}
            />
          )}
        </div>
      </ClerkLoaded>
    </div>
  );
}
