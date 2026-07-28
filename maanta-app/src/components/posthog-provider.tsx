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
