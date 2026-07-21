/**
 * Real Clerk sign-in through the hosted `<SignIn>` UI at `/login`.
 *
 * The app uses Clerk as its auth layer (Supabase third-party auth); there is no
 * password — sign-in is email OTP. In a Clerk **test** instance, `+clerk_test`
 * addresses accept the fixed code from `OTP_CODE` (default `424242`) and
 * `@clerk/testing`'s Testing Token (installed in globalSetup) defuses bot
 * protection so headless sign-in isn't challenged.
 *
 * Selectors target Clerk's own stable field names/labels, not MAANTA markup, so
 * they survive MAANTA UI changes and only move if Clerk changes its component.
 */
import { expect, type Page } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { OTP_CODE } from "./accounts";

/** Sign in as `email` and wait until Clerk has left `/login`. */
export async function signIn(page: Page, email: string, otp = OTP_CODE): Promise<void> {
  await setupClerkTestingToken({ page });
  await page.goto("/login");

  // Email identifier step.
  const identifier = page.locator('input[name="identifier"]');
  await expect(identifier, "Clerk <SignIn> email field should render at /login").toBeVisible();
  await identifier.fill(email);
  await page.getByRole("button", { name: /continue/i }).click();

  // Email-code step: Clerk splits the OTP across per-digit inputs but also
  // exposes a single hidden field; typing the whole code into the first visible
  // segment fills them all.
  const codeField = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
  await expect(codeField, "Clerk email-code field should render").toBeVisible();
  await codeField.click();
  await page.keyboard.type(otp, { delay: 40 });

  // Clerk auto-submits when the code is complete; nudge the verify button if it
  // is present and still waiting.
  const verify = page.getByRole("button", { name: /^(verify|continue)/i });
  if (await verify.isVisible().catch(() => false)) {
    await verify.click().catch(() => {});
  }

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** Sign in, then land the merchant on a specific in-app path (post-login Clerk
 *  bounces to the fallback redirect, so navigate explicitly afterward). */
export async function signInAndGoto(page: Page, email: string, path: string): Promise<void> {
  await signIn(page, email);
  await page.goto(path);
}
