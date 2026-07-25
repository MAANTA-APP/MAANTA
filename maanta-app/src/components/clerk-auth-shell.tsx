"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  SignIn,
  SignUp,
} from "@clerk/nextjs";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/states";

const CLERK_CARD_APPEARANCE = {
  elements: {
    rootBox: "w-full",
    card: "shadow-none border border-line rounded-2xl",
  },
} as const;

function AuthLoading() {
  return (
    <div className="w-full max-w-md space-y-4" aria-busy="true" aria-label="Loading sign-in">
      <Skeleton className="mx-auto h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

function AuthFailed({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="w-full max-w-md text-center">
      <p className="text-base font-bold text-ink">
        {mode === "sign-up" ? "Couldn’t load sign-up" : "Couldn’t load sign-in"}
      </p>
      <p className="mt-2 text-sm text-muted">
        Check your connection and try again. You can also browse live deals without an account.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <ButtonLink href={mode === "sign-up" ? "/sign-up" : "/login"} full>
          Try again
        </ButtonLink>
        <ButtonLink href="/feed" variant="ghost" full>
          Browse deals
        </ButtonLink>
      </div>
    </div>
  );
}

/** Wraps Clerk-hosted sign-in/up with loading + failure UI so a blocked Clerk script never leaves a blank page. */
export function ClerkAuthShell({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <>
      <ClerkLoading>
        <AuthLoading />
      </ClerkLoading>
      <ClerkFailed>
        <AuthFailed mode={mode} />
      </ClerkFailed>
      <ClerkLoaded>
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
      </ClerkLoaded>
    </>
  );
}
