"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { destinationForRole } from "@/lib/pwa/app-bootstrap";
import { Body, HeadingMd } from "@/components/ui/claude";
import { isClerkAuthClient } from "@/lib/auth/strategy-client";
import { useSupabaseSignedIn } from "@/components/auth/supabase-email-login";
import { logAuthFlow } from "@/lib/auth/supabase-email-auth";

/**
 * Role-aware entry after sign-in and as the PWA `start_url`.
 * Role lives on `public.users` — fetched via GET /api/me.
 *
 * Must branch on auth strategy: Clerk's useAuth() throws (or always reports
 * signed-out) when ClerkProvider is not mounted under the supabase strategy.
 */
export default function AppBootstrapPage() {
  if (isClerkAuthClient()) {
    return <ClerkAppBootstrap />;
  }
  return <SupabaseAppBootstrap />;
}

function ClerkAppBootstrap() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState("Opening Maanta…");

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      logAuthFlow("bootstrap", "clerk signed out; redirecting to login");
      router.replace("/login?next=/app-bootstrap");
      return;
    }

    return routeByRole(router, setStatus);
  }, [isLoaded, isSignedIn, router]);

  return <BootstrapShell status={status} />;
}

function SupabaseAppBootstrap() {
  const signedIn = useSupabaseSignedIn();
  const router = useRouter();
  const [status, setStatus] = useState("Opening Maanta…");

  useEffect(() => {
    if (signedIn === null) return;

    if (!signedIn) {
      logAuthFlow("bootstrap", "supabase signed out; redirecting to login");
      router.replace("/login?next=/app-bootstrap");
      return;
    }

    return routeByRole(router, setStatus);
  }, [signedIn, router]);

  return <BootstrapShell status={status} />;
}

function routeByRole(
  router: ReturnType<typeof useRouter>,
  setStatus: (s: string) => void
) {
  let cancelled = false;

  (async () => {
    try {
      logAuthFlow("bootstrap", "fetching /api/me for role routing");
      const res = await fetch("/api/me");
      if (cancelled) return;
      if (res.status === 401) {
        logAuthFlow("bootstrap", "/api/me returned 401");
        router.replace("/login?next=/app-bootstrap");
        return;
      }
      if (!res.ok) {
        setStatus("Could not load your profile. Taking you to the feed…");
        router.replace("/feed");
        return;
      }
      const data = (await res.json()) as { role?: string };
      const dest = destinationForRole(data.role);
      logAuthFlow("bootstrap", "routing by role", { role: data.role, dest });
      setStatus("Redirecting…");
      router.replace(dest);
    } catch {
      if (cancelled) return;
      setStatus("Network error. Taking you to the feed…");
      router.replace("/feed");
    }
  })();

  return () => {
    cancelled = true;
  };
}

function BootstrapShell({ status }: { status: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-stone px-5 text-center">
      <HeadingMd as="h1">Maanta</HeadingMd>
      <Body className="mt-2 text-muted">{status}</Body>
    </main>
  );
}
