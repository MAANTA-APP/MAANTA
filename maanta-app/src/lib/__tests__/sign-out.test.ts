import { describe, expect, it, vi } from "vitest";
import {
  SIGN_OUT_DESTINATION,
  SIGN_OUT_FAILED_MESSAGE,
  signOutWithClerk,
  signOutWithSupabase,
} from "@/lib/auth/sign-out";

/**
 * The sign-out contract, provider by provider (D260).
 *
 * The button used to navigate to /login whatever Supabase answered, because
 * `signOut()` resolves `{ error }` rather than throwing; and it let a Clerk
 * rejection escape as an unhandled promise. Both are now results, and these
 * tests pin the four cells: each provider, success and refusal.
 */
describe("signOutWithClerk", () => {
  it("asks Clerk to revoke the session and redirect to /login, and reports ok", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    await expect(signOutWithClerk(signOut)).resolves.toEqual({ ok: true });
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: SIGN_OUT_DESTINATION });
    expect(SIGN_OUT_DESTINATION).toBe("/login");
  });

  it("turns a rejection into a result rather than an unhandled promise", async () => {
    const signOut = vi.fn().mockRejectedValue(new Error("clerk unreachable"));
    await expect(signOutWithClerk(signOut)).resolves.toEqual({
      ok: false,
      message: SIGN_OUT_FAILED_MESSAGE,
    });
  });
});

describe("signOutWithSupabase", () => {
  const router = () => ({ push: vi.fn(), refresh: vi.fn() });

  it("signs out, then pushes /login and refreshes the server tree", async () => {
    const r = router();
    const auth = { signOut: vi.fn().mockResolvedValue({ error: null }) };
    await expect(signOutWithSupabase(auth, r)).resolves.toEqual({ ok: true });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(r.push).toHaveBeenCalledWith("/login");
    expect(r.refresh).toHaveBeenCalledTimes(1);
    // Order: the session is gone before anything navigates.
    expect(auth.signOut.mock.invocationCallOrder[0]).toBeLessThan(r.push.mock.invocationCallOrder[0]);
  });

  it("does NOT navigate when the provider returns an error — the session is still live", async () => {
    const r = router();
    const auth = { signOut: vi.fn().mockResolvedValue({ error: { message: "refresh_token_not_found" } }) };
    await expect(signOutWithSupabase(auth, r)).resolves.toEqual({
      ok: false,
      message: SIGN_OUT_FAILED_MESSAGE,
    });
    expect(r.push).not.toHaveBeenCalled();
    expect(r.refresh).not.toHaveBeenCalled();
  });

  it("treats a thrown network failure the same way", async () => {
    const r = router();
    const auth = { signOut: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) };
    await expect(signOutWithSupabase(auth, r)).resolves.toMatchObject({ ok: false });
    expect(r.push).not.toHaveBeenCalled();
  });

  it("the failure message says the user is still signed in, in plain words", () => {
    expect(SIGN_OUT_FAILED_MESSAGE).toMatch(/still signed in/i);
  });
});
