"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isClerkAuthClient } from "@/lib/auth/strategy-client";

function ClerkSignOutButton() {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectUrl: "/login" })}
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
