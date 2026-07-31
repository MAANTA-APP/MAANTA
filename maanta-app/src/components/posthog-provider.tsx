"use client";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { isClerkAuthClient } from "@/lib/auth/strategy";
import { createClient } from "@/lib/supabase/client";

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
if (typeof window !== "undefined" && posthogToken) {
  posthog.init(posthogToken, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    /**
     * Cookieless for anonymous visitors — founder ruling 2026-07-31.
     *
     * `memory` persistence keeps analytics state in the page only: nothing is
     * written to cookies or localStorage, and it is gone when the tab closes.
     * Under the Kenya Data Protection Act 2019 the question is not "do we need a
     * banner" but "what is the basis for each thing we run and can we evidence
     * it" — and storing nothing on an anonymous visitor's device removes the
     * hardest part of that question rather than answering it with a banner.
     *
     * The trade is real and was accepted: no cross-session attribution before
     * sign-in, so a visitor who returns tomorrow is a new anonymous user. The
     * alternative was a consent banner on every visit, which costs most of the
     * anonymous analytics anyway and adds friction to the one journey — the
     * shopper's — that has to feel frictionless.
     *
     * `identify()` after sign-in is unaffected: a signed-in user is processed on
     * a different basis, disclosed in the Cookie Notice, and that call is where
     * durable identity legitimately begins.
     */
    persistence: "memory",
  });
}

function ClerkPostHogUserSync() {
  const { user, isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && user) {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress ?? undefined,
        name: user.fullName ?? undefined,
      });
    } else {
      posthog.reset();
    }
  }, [isLoaded, isSignedIn, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function SupabasePostHogUserSync() {
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) {
        posthog.identify(user.id, { email: user.email ?? undefined });
      } else {
        posthog.reset();
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (user) {
        posthog.identify(user.id, { email: user.email ?? undefined });
      } else {
        posthog.reset();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return null;
}

export function PostHogClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider client={posthog}>
      {isClerkAuthClient() ? <ClerkPostHogUserSync /> : <SupabasePostHogUserSync />}
      {children}
    </PostHogProvider>
  );
}
