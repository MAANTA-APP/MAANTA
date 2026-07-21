import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { auth } from '@clerk/nextjs/server';

// Server-side anon client. Auth is delegated to Clerk: the Clerk session token
// (which carries the `sub` and `role: authenticated` claims Supabase needs) is
// attached on every request via `accessToken`, so RLS policies and the
// authz-enforcing SECURITY DEFINER RPCs see the caller's identity through
// public.current_user_id() / current_user_role(). The cookie adapter is kept
// only so @supabase/ssr has a store; no Supabase Auth session lives there.
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      async accessToken() {
        return (await auth()).getToken();
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component; nothing to persist under Clerk
          }
        },
      },
    }
  );
}
