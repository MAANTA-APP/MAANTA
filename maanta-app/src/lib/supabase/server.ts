import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { isSupabaseAuth } from "@/lib/auth/strategy";

function cookieAdapter(cookieStore: ReturnType<typeof cookies>) {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[]) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      } catch {
        // called from a Server Component; nothing to persist
      }
    },
  };
}

// Server-side anon client. Clerk strategy: Clerk JWT via accessToken. Supabase
// strategy: cookie session from Supabase Auth (email OTP in dev/test).
export function createClient() {
  const cookieStore = cookies();

  if (isSupabaseAuth()) {
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: cookieAdapter(cookieStore) }
    );
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      async accessToken() {
        return (await auth()).getToken();
      },
      cookies: cookieAdapter(cookieStore),
    }
  );
}
