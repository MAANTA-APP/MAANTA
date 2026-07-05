import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">MAANTA</h1>
      {user ? (
        <>
          <p className="text-sm text-black/60 dark:text-white/60">
            Signed in as {user.phone}
          </p>
          <SignOutButton />
        </>
      ) : (
        <Link
          href="/login"
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Sign in
        </Link>
      )}
    </main>
  );
}
