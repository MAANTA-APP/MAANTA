"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { ButtonLink } from "@/components/ui/button";
import { isClerkAuthClient } from "@/lib/auth/strategy";
import { useSupabaseSignedIn } from "@/components/auth/supabase-email-login";
import { SignOutButton } from "@/app/sign-out-button";

function ClerkAuthControls() {
  return (
    <>
      <SignedOut>
        <SignInButton mode="redirect">
          <button className="text-sm font-semibold text-ink underline-offset-2 hover:underline">
            Sign in
          </button>
        </SignInButton>
        <ButtonLink href="/sign-up" size="sm">
          Sign up
        </ButtonLink>
      </SignedOut>
      <SignedIn>
        <ButtonLink href="/feed" size="sm">
          My feed
        </ButtonLink>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </>
  );
}

function SupabaseAuthControls() {
  const signedIn = useSupabaseSignedIn();

  if (signedIn === null) {
    return <span className="h-8 w-16 animate-pulse rounded-full bg-line" aria-hidden />;
  }

  if (!signedIn) {
    return (
      <>
        <Link
          href="/login"
          className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
        >
          Sign in
        </Link>
        <ButtonLink href="/sign-up" size="sm">
          Sign up
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <ButtonLink href="/feed" size="sm">
        My feed
      </ButtonLink>
      <SignOutButton />
    </>
  );
}

/** Strategy-aware auth controls for public nav. */
export function AuthNavControls() {
  return isClerkAuthClient() ? <ClerkAuthControls /> : <SupabaseAuthControls />;
}
