/**
 * Link seeded `public.users` rows to their Clerk **test** users.
 *
 * Why this exists: the Node 0 seed predates Clerk, so every seeded `public.users`
 * row has `clerk_user_id = NULL` (see docs/skills/clerk-auth.md, "Legacy user
 * linking"). Clerk sign-in resolves identity by `clerk_user_id`, so without this
 * step a signed-in merchant would provision a *fresh* row and would NOT own the
 * seeded deal/wallet — the golden path could never line up.
 *
 * globalSetup calls this once. It's idempotent: it looks up the Clerk user id by
 * email via the Clerk Backend API and stamps it onto the matching seeded row.
 * Requires CLERK_SECRET_KEY (Clerk Backend API) and SUPABASE_SERVICE_ROLE_KEY.
 */
import { serviceClient } from "./supabase";

async function clerkUserIdByEmail(email: string, secretKey: string): Promise<string | null> {
  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`,
    { headers: { Authorization: `Bearer ${secretKey}` } }
  );
  if (!res.ok) {
    throw new Error(`Clerk Backend API lookup for ${email} failed: ${res.status} ${await res.text()}`);
  }
  const users = (await res.json()) as Array<{ id: string }>;
  return users[0]?.id ?? null;
}

/**
 * Stamp `clerk_user_id` onto each seeded row by email. Returns a report so
 * globalSetup can log exactly which accounts linked and which are missing a
 * Clerk test user (the actionable failure mode).
 */
export async function linkSeededUsersToClerk(
  emails: readonly string[]
): Promise<{ linked: string[]; missingClerkUser: string[]; noSeedRow: string[] }> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("linkSeededUsersToClerk needs CLERK_SECRET_KEY");
  const db = serviceClient();

  const linked: string[] = [];
  const missingClerkUser: string[] = [];
  const noSeedRow: string[] = [];

  for (const email of emails) {
    const clerkId = await clerkUserIdByEmail(email, secretKey);
    if (!clerkId) {
      missingClerkUser.push(email);
      continue;
    }
    const { data, error } = await db
      .from("users")
      .update({ clerk_user_id: clerkId })
      .eq("email", email)
      .select("id");
    if (error) throw new Error(`could not link ${email}: ${error.message}`);
    if (!data || data.length === 0) noSeedRow.push(email);
    else linked.push(email);
  }

  return { linked, missingClerkUser, noSeedRow };
}
