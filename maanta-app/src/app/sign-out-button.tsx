"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isClerkAuthClient } from "@/lib/auth/strategy-client";
import { purgeCachedPages } from "@/lib/pwa/purge-cached-pages";

function ClerkSignOutButton() {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      // D235 — the cached /my-deals document holds this shopper's codes and
      // Cache Storage is scoped to the origin, not the user. Purge before the
      // session goes, so a shared handset cannot reload into someone else's
      // tickets. Awaited: sign-out redirects, and a fire-and-forget purge could
      // lose the race.
      onClick={async () => {
        await purgeCachedPages();
        void signOut({ redirectUrl: "/login" });
      }}
      className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
    >
      Sign out
    </button>
  );
}

function SupabaseSignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        // D235 — see the Clerk branch above. Both strategies must purge, or
        // the protection depends on which auth mode happens to be running.
        await purgeCachedPages();
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
    >
      Sign out
    </button>
  );
}

export default function SignOutButton() {
  return isClerkAuthClient() ? <ClerkSignOutButton /> : <SupabaseSignOutButton />;
}
