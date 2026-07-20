import { createBrowserClient } from '@supabase/ssr';

// Browser anon client. Auth is delegated to Clerk: when a Clerk session exists,
// its token (carrying `sub` and `role: authenticated`) is attached via
// `accessToken` so any client-side query runs under the caller's RLS identity.
// Falls back to an anon token when signed out.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      async accessToken() {
        // window.Clerk is populated by <ClerkProvider>; null before it loads.
        const clerk = (globalThis as { Clerk?: { session?: { getToken: () => Promise<string | null> } } }).Clerk;
        return (await clerk?.session?.getToken()) ?? null;
      },
    }
  );
}
