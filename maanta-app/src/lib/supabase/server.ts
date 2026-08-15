import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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

/**
 * Server-side anon client, one shape per auth strategy.
 *
 * ## The invariant, and the P0 that established it
 *
 * **Clerk strategy: the Clerk JWT is the only auth mechanism. No cookie
 * adapter, and nothing that touches `supabase.auth`.**
 * **Supabase strategy: the cookie session is the only auth mechanism. No
 * `accessToken`.**
 *
 * These two must never be combined, and until 2026-08-14 the Clerk branch
 * combined them — it passed `accessToken` *and* a cookie adapter to
 * `createServerClient`. `@supabase/ssr` wires cookie-based auth by subscribing
 * to `supabase.auth.onAuthStateChange` while constructing the client, and
 * `@supabase/supabase-js` refuses any access to `supabase.auth` once
 * `accessToken` is configured. So construction threw, every time:
 *
 *     Error: @supabase/supabase-js: Supabase Client is configured with the
 *     accessToken option, accessing supabase.auth.onAuthStateChange is not
 *     possible
 *
 * Confirmed in production runtime logs on 2026-08-14 — HTTP 500 from
 * `POST /api/redemptions`, thrown before `claim_deal` was ever called, which is
 * why no ticket, redemption or merchant fee was created. It was never specific
 * to claiming: **every** route below that builds this client under Clerk had
 * the same unconditional failure, including the merchant till. See
 * `docs/ops/clerk-supabase-server-client-p0-2026-08-14.md`.
 *
 * ## Why the Clerk branch no longer uses `@supabase/ssr`
 *
 * `createServerClient` exists to reconcile a cookie session with SSR. Under
 * Clerk there is no cookie session to reconcile — the bearer token is the whole
 * story — so the SSR wrapper contributes nothing but the `auth` subscription
 * that throws. `@supabase/supabase-js`'s own `createClient` with `accessToken`
 * is the documented third-party-auth shape, and it is what
 * `src/lib/supabase/client.ts` has always done in the browser: `accessToken`
 * alone, no cookie plumbing. The two factories now agree.
 *
 * `cookies()` is likewise read only in the branch that needs it. Calling it in
 * the Clerk branch was requesting request state nothing consumed.
 *
 * ## Why nothing caught it
 *
 * CI, local dev and every test run use the Supabase strategy — the branch that
 * was correct. The broken branch only executes when `MAANTA_AUTH_STRATEGY` and
 * `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` are both `clerk`, which is production and
 * nowhere else. `src/lib/supabase/__tests__/server-client.test.ts` now exercises
 * both branches directly, including a stand-in for the supabase-js guard, so
 * the combination fails a test rather than a shopper.
 *
 * Related but distinct: **D70** was the browser-side instance of the same
 * supabase-js guard — a client component calling `supabase.auth.getSession()`
 * on an `accessToken` client after hydrating into the wrong strategy branch.
 * Same guard, different call site; that one is fixed and stays fixed.
 */
export function createClient() {
  if (isSupabaseAuth()) {
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: cookieAdapter(cookies()) }
    );
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      async accessToken() {
        return (await auth()).getToken();
      },
    }
  );
}
