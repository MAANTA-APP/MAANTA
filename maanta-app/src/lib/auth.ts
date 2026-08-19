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

/**
 * Re-exported so existing importers keep working. The union itself lives in
 * `@/lib/roles` — it used to be declared here *and* inline in `data.ts`, which
 * meant adding a role required remembering both.
 */
import type { AppRole } from "@/lib/roles";
export type { AppRole };

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
 * The phone to persist on `public.users.phone`, or null — only a Clerk-VERIFIED
 * primary phone is stored.
 *
 * This column is an access-control input, not just contact detail:
 * `getMerchantContext` (src/lib/merchant.ts) links a signed-in user into a
 * pre-invited `merchant_staff` seat by matching `public.users.phone`, so a number
 * the user has NOT proven they control must never land here. An unverified
 * primary phone → null.
 *
 * This is the source-side half of the same invariant D124 protects: migration
 * 20260817130000 froze the column against self-writes via PostgREST *and* states
 * that `users.phone` "is assumed to be the Clerk-verified number written once at
 * provisioning". That assumption was not actually enforced — provisioning wrote
 * `primaryPhoneNumber` unconditionally (D126). This makes the assumption true.
 *
 * Exported as a pure function so the rule is tested in one place rather than
 * mocked through the whole provisioning path.
 */
export function verifiedPrimaryPhone(
  cu: {
    primaryPhoneNumber?: {
      phoneNumber?: string | null;
      verification?: { status?: string | null } | null;
    } | null;
  } | null
): string | null {
  const primary = cu?.primaryPhoneNumber;
  if (!primary || primary.verification?.status !== "verified") return null;
  return primary.phoneNumber ?? null;
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
  // Verified-only: `users.phone` gates merchant_staff linking (see
  // verifiedPrimaryPhone). An unverified Clerk phone is not persisted.
  const phone = verifiedPrimaryPhone(cu);
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
