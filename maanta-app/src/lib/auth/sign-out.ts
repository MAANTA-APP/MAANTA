/**
 * The two ways a MAANTA session ends, as plain functions.
 *
 * `SignOutButton` (src/app/sign-out-button.tsx) is the only place either is
 * called from, and it renders on every shell — shopper, merchant, admin,
 * founder. The provider calls live here rather than inline in the component
 * so the contract can be tested without a browser: which provider is asked,
 * with what, where the user lands, and — the part that was missing — what
 * happens when the provider says no.
 *
 * Before this module the Supabase path was `await supabase.auth.signOut();
 * router.push("/login")`. `signOut()` does not throw; it resolves to
 * `{ error }`, so a refused sign-out (network down, a revoked refresh token,
 * a 5xx from the auth server) still navigated to `/login` and the button, by
 * leaving, told the user the session had ended when it had not. On a shared
 * counter or founder device that is the one lie a sign-out control cannot
 * tell. The Clerk path rejected instead of resolving on failure, which is
 * honest but silent: an unhandled rejection and a button that did nothing.
 *
 * Both paths now return a result. `ok: true` means the provider confirmed the
 * session is gone (and, for Supabase, that the app navigated). `ok: false`
 * means it did not, and the button stays put and says so. Nothing here
 * imports a strategy module: the caller decides which function to call, so
 * this file stays safe to import from a `"use client"` component
 * (auth-strategy-boundary.test.ts).
 */

/** Where every sign-out lands. One value, so the two paths cannot disagree. */
export const SIGN_OUT_DESTINATION = "/login";

export const SIGN_OUT_FAILED_MESSAGE =
  "Sign out did not complete. You are still signed in — try again.";

export type SignOutResult = { ok: true } | { ok: false; message: string };

/** The Clerk shape this module relies on: `useClerk().signOut`. */
export type ClerkSignOut = (options: { redirectUrl: string }) => Promise<unknown>;

/** The Supabase shape this module relies on: `createClient().auth.signOut`. */
export type SupabaseAuthLike = {
  signOut: () => Promise<{ error: { message?: string } | null }>;
};

/** The two router calls the Supabase path needs. Clerk navigates itself. */
export type RouterLike = {
  push: (href: string) => void;
  refresh: () => void;
};

/**
 * Clerk ends the session and performs the redirect itself once the session is
 * revoked, so there is no app-side navigation to make; the promise rejecting
 * is the only failure signal, and it is turned into a result rather than an
 * unhandled rejection.
 */
export async function signOutWithClerk(signOut: ClerkSignOut): Promise<SignOutResult> {
  try {
    await signOut({ redirectUrl: SIGN_OUT_DESTINATION });
    return { ok: true };
  } catch {
    return { ok: false, message: SIGN_OUT_FAILED_MESSAGE };
  }
}

/**
 * Supabase reports failure as a resolved `{ error }`, never a throw, so the
 * result is inspected before anything navigates. On success `router.refresh()`
 * follows the push so server components re-render signed-out rather than
 * serving the cached signed-in tree.
 */
export async function signOutWithSupabase(
  auth: SupabaseAuthLike,
  router: RouterLike
): Promise<SignOutResult> {
  let error: { message?: string } | null;
  try {
    ({ error } = await auth.signOut());
  } catch {
    return { ok: false, message: SIGN_OUT_FAILED_MESSAGE };
  }
  if (error) return { ok: false, message: SIGN_OUT_FAILED_MESSAGE };
  router.push(SIGN_OUT_DESTINATION);
  router.refresh();
  return { ok: true };
}
