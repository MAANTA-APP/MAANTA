"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { destinationForRole } from "@/lib/pwa/app-bootstrap";
import { Body, HeadingMd } from "@/components/ui/claude";

/**
 * Role-aware entry after Clerk sign-in and as the PWA `start_url`.
 * Role lives on `public.users` (not Clerk metadata) — fetched via GET /api/me.
 */
export default function AppBootstrapPage() {
  const { isLoaded, isSignedIn } = useAuth();
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

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-stone px-5 text-center">
      <HeadingMd as="h1">Maanta</HeadingMd>
      <Body className="mt-2 text-muted">{status}</Body>
    </main>
  );
}
