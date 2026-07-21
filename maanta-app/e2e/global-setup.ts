/**
 * Playwright globalSetup:
 *  1. Mint a Clerk Testing Token (`clerkSetup`) so headless sign-in isn't blocked
 *     by Clerk's bot protection.
 *  2. Link the seeded `public.users` rows to their Clerk test users so a signed-in
 *     merchant owns the seeded deal/wallet (see e2e/fixtures/link-clerk.ts).
 *
 * Both steps are best-effort and loudly logged: if the credentials for the live
 * test environment aren't present yet, setup explains what's missing instead of
 * failing cryptically deep inside a spec. The suite is expected to be red until
 * that environment exists (Definition of Done §8).
 */
import { clerkSetup } from "@clerk/testing/playwright";
import { ALL_ACCOUNTS } from "./fixtures/accounts";
import { linkSeededUsersToClerk } from "./fixtures/link-clerk";

export default async function globalSetup() {
  if (process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    await clerkSetup();
    console.log("[e2e] Clerk Testing Token ready.");
  } else {
    console.warn(
      "[e2e] Skipping clerkSetup — set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY. " +
        "Sign-in will fail until a Clerk test instance is wired in."
    );
  }

  if (process.env.CLERK_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const emails = ALL_ACCOUNTS.map((a) => a.email);
      const report = await linkSeededUsersToClerk(emails);
      console.log(`[e2e] Linked seeded users to Clerk: ${report.linked.join(", ") || "(none)"}`);
      if (report.missingClerkUser.length) {
        console.warn(
          `[e2e] No Clerk test user for: ${report.missingClerkUser.join(", ")} — ` +
            "provision these (once per instance) or sign-in will fail."
        );
      }
      if (report.noSeedRow.length) {
        console.warn(
          `[e2e] No seeded public.users row for: ${report.noSeedRow.join(", ")} — ` +
            "apply supabase/seed/node0_rehearsal_seed.sql to the test database."
        );
      }
    } catch (err) {
      console.warn(`[e2e] User linking skipped: ${(err as Error).message}`);
    }
  } else {
    console.warn(
      "[e2e] Skipping Clerk↔Supabase user linking — set SUPABASE_SERVICE_ROLE_KEY (+ CLERK_SECRET_KEY). " +
        "Merchants won't own the seeded deal/wallet until linked."
    );
  }
}
