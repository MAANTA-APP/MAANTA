"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { destinationForRole } from "@/lib/pwa/app-bootstrap";
import { isClerkAuthClient } from "@/lib/auth/strategy";
import { useSupabaseSignedIn } from "@/components/auth/supabase-email-login";
import { Body, HeadingMd } from "@/components/ui/claude";

/**
 * Role-aware entry after sign-in and as the PWA `start_url`.
 * Role lives on `public.users` (not Clerk metadata) — fetched via GET /api/me.
 *
 * Strategy-aware: Clerk mode uses `useAuth()`; Supabase/authjs mode uses
 * `useSupabaseSignedIn()`. Never call Clerk hooks when ClerkProvider is absent.
 */

function BootstrapShell({ status }: { status: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-stone px-5 text-center">
      <HeadingMd as="h1">Maanta</HeadingMd>
      <Body className="mt-2 text-muted">{status}</Body>
    </main>
  );
}

function useRoleRedirect(isLoaded: boolean, isSignedIn: boolean) {
  const router = useRouter();
  const [status, setStatus] = useState("Opening Maanta…");

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.replace("/login?next=/app-bootstrap");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/me");
        if (cancelled) return;
        if (res.status === 401) {
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
  }, [isLoaded, isSignedIn, router]);

  return status;
}

function ClerkBootstrap() {
  const { isLoaded, isSignedIn } = useAuth();
  const status = useRoleRedirect(isLoaded, Boolean(isSignedIn));
  return <BootstrapShell status={status} />;
}

function SupabaseBootstrap() {
  const signedIn = useSupabaseSignedIn();
  const isLoaded = signedIn !== null;
  const status = useRoleRedirect(isLoaded, Boolean(signedIn));
  return <BootstrapShell status={status} />;
}

export default function AppBootstrapPage() {
  return isClerkAuthClient() ? <ClerkBootstrap /> : <SupabaseBootstrap />;
}
