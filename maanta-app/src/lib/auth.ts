import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Clerk is the authentication layer; Supabase remains the data + RLS layer
 * (Clerk is wired in as a Supabase third-party auth provider — see
 * docs/skills/clerk-auth.md). The Clerk user id arrives in the Supabase JWT as
 * the `sub` claim and is stored on public.users.clerk_user_id. Every server
 * entry point resolves (and lazily provisions) the matching public.users row
 * through the helpers below, replacing the old auth.users insert trigger that
 * only fired for Supabase-Auth sign-ups.
 */

export type AppRole =
  | "customer"
  | "merchant_admin"
  | "merchant_staff"
  | "agent"
  | "admin";

/** Clerk user id for the current request, or null when signed out. */
export async function currentClerkUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * Resolve the public.users row for the signed-in Clerk user, provisioning it
 * on first sight. Returns null only when the request is unauthenticated.
 *
 * `columns` mirrors a Supabase `.select()` list; the returned object is typed
 * loosely because callers pick different projections. `id` and `role` are
 * always present in the provisioned row.
 */
export async function ensureAppUser<T = { id: string; role: AppRole }>(
  columns = "id, role"
): Promise<T | null> {
  const userId = await currentClerkUserId();
  if (!userId) return null;

  const service = createServiceClient();

  const select = ensureColumns(columns);
  const { data: existing } = await service
    .from("users")
    .select(select)
    .eq("clerk_user_id", userId)
    .maybeSingle();
  if (existing) return existing as T;

  // First authenticated request for this Clerk user — create the mirror row.
  const cu = await currentUser();
  const phone = cu?.primaryPhoneNumber?.phoneNumber ?? null;
  const email = cu?.primaryEmailAddress?.emailAddress ?? null;
  const fullName =
    [cu?.firstName, cu?.lastName].filter(Boolean).join(" ").trim() || null;

  const { data: created, error } = await service
    .from("users")
    .upsert(
      { clerk_user_id: userId, phone, email, full_name: fullName, role: "customer" },
      { onConflict: "clerk_user_id" }
    )
    .select(select)
    .single();

  if (error) {
    // A racing request may have inserted the row between our select and upsert,
    // or a legacy row already owns this phone/email — fall back to a plain read.
    const { data: reread } = await service
      .from("users")
      .select(select)
      .eq("clerk_user_id", userId)
      .maybeSingle();
    return (reread as T) ?? null;
  }

  return created as T;
}

/** Guarantee `id` and `role` are always selected so callers can rely on them. */
function ensureColumns(columns: string): string {
  const wanted = new Set(
    columns
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
  );
  wanted.add("id");
  wanted.add("role");
  return Array.from(wanted).join(", ");
}
