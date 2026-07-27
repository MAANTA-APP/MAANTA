import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseAuthClient } from "@/lib/auth/strategy";

// Browser anon client. Clerk strategy attaches the Clerk session token; Supabase
// strategy uses the Supabase Auth cookie session (email OTP in dev/test).
export function createClient() {
  if (isSupabaseAuthClient()) {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      async accessToken() {
        const clerk = (
          globalThis as {
            Clerk?: { session?: { getToken: () => Promise<string | null> } };
          }
        ).Clerk;
        return (await clerk?.session?.getToken()) ?? null;
      },
    }
  );
}
