import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isClerkAuth, isSupabaseAuth, phoneOtpEnabled } from "@/lib/auth/strategy";
import {
  currentSupabaseAuthEmail,
  currentSupabaseAuthUserId,
} from "@/lib/auth/supabase-session";

/**
 * Identity layer: Clerk for launch (production), Supabase Auth for dev/test
 * email-first rehearsal. Supabase remains the data + RLS layer in both modes.
 *
 * Clerk: JWT `sub` → public.users.clerk_user_id (see docs/skills/clerk-auth.md).
 * Supabase Auth: JWT `sub` (UUID) → public.users.auth_uid (legacy path).
 */

export type AppRole =
  | "customer"
  | "merchant_admin"
  | "merchant_staff"
  | "agent"
  | "admin";

/** External auth subject for the current request, or null when signed out. */
export async function currentAuthSubjectId(): Promise<string | null> {
  if (isSupabaseAuth()) {
    return currentSupabaseAuthUserId();
  }
  const { userId } = await auth();
  return userId ?? null;
}

/** Clerk user id — null when signed out or when not using the Clerk strategy. */
export async function currentClerkUserId(): Promise<string | null> {
  if (!isClerkAuth()) return null;
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * True when the signed-in user has a verified phone for claim gating.
 * Clerk launch: verified phone on the Clerk account (SMS OTP).
 * Dev/test Supabase Auth: phone OTP is disabled — gate is relaxed so rehearsal
 * can exercise claim → verify without Clerk SMS spend.
 */
export async function currentUserHasVerifiedPhone(): Promise<boolean> {
  if (!phoneOtpEnabled()) {
    return true;
  }
  const cu = await currentUser();
  if (!cu) return false;
  const phones = cu.phoneNumbers ?? [];
  return phones.some((p) => p.verification?.status === "verified");
}

/**
 * Resolve the public.users row for the signed-in identity, provisioning on
 * first sight. Returns null only when the request is unauthenticated.
 */
export async function ensureAppUser<T = { id: string; role: AppRole }>(
  columns = "id, role"
): Promise<T | null> {
  if (isSupabaseAuth()) {
    return ensureAppUserFromSupabaseAuth<T>(columns);
  }
  return ensureAppUserFromClerk<T>(columns);
}

async function ensureAppUserFromClerk<T>(
  columns: string
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
    const { data: reread } = await service
      .from("users")
      .select(select)
      .eq("clerk_user_id", userId)
      .maybeSingle();
    return (reread as T) ?? null;
  }

  return created as T;
}

async function ensureAppUserFromSupabaseAuth<T>(
  columns: string
): Promise<T | null> {
  const authUid = await currentSupabaseAuthUserId();
  if (!authUid) return null;

  const service = createServiceClient();
  const select = ensureColumns(columns);

  const { data: existing } = await service
    .from("users")
    .select(select)
    .eq("auth_uid", authUid)
    .maybeSingle();
  if (existing) return existing as T;

  const email = await currentSupabaseAuthEmail();

  const { data: created, error } = await service
    .from("users")
    .upsert(
      { auth_uid: authUid, email, role: "customer" },
      { onConflict: "auth_uid" }
    )
    .select(select)
    .single();

  if (error) {
    const { data: reread } = await service
      .from("users")
      .select(select)
      .eq("auth_uid", authUid)
      .maybeSingle();
    return (reread as T) ?? null;
  }

  return created as T;
}

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
