"use client";

import { useClerk } from "@clerk/nextjs";

export default function SignOutButton() {
  const { signOut } = useClerk();

  return (
    <button
      onClick={() => signOut({ redirectUrl: "/login" })}
      className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
    >
      Sign out
    </button>
  );
}
