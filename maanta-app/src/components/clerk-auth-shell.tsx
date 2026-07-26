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

const CLERK_CARD_APPEARANCE = {
  elements: {
    rootBox: "w-full",
    card: "shadow-none border-0 bg-transparent",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
  },
} as const;

function AuthLoading() {
  return (
    <div
      className="w-full max-w-md space-y-4 rounded-card border border-line bg-white p-6 shadow-card"
      aria-busy="true"
      aria-label="Loading sign-in"
    >
      <Skeleton className="mx-auto h-8 w-48" />
      <Skeleton className="h-10 w-full rounded-full" />
      <Skeleton className="h-10 w-full rounded-full" />
      <Skeleton className="h-40 w-full rounded-card" />
    </div>
  );
}

function AuthFailed({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="w-full max-w-md rounded-card border border-line bg-white p-6 text-center shadow-card">
      <HeadingLg as="h1" className="text-[1.35rem]">
        {mode === "sign-up" ? "Couldn’t load sign-up" : "Couldn’t load sign-in"}
      </HeadingLg>
      <Body className="mt-2">
        Check your connection and try again. You can also browse live deals
        without an account.
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
            : "Welcome back — claim live deals at your mall."}
        </Body>
      </div>

      <ClerkLoading>
        <AuthLoading />
      </ClerkLoading>
      <ClerkFailed>
        <AuthFailed mode={mode} />
      </ClerkFailed>
      <ClerkLoaded>
        <div className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
          {mode === "sign-up" ? (
            <SignUp
              routing="path"
              path="/sign-up"
              signInUrl="/login"
              appearance={CLERK_CARD_APPEARANCE}
            />
          ) : (
            <SignIn
              routing="path"
              path="/login"
              signUpUrl="/sign-up"
              appearance={CLERK_CARD_APPEARANCE}
            />
          )}
        </div>
      </ClerkLoaded>
    </div>
  );
}
