import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isClerkAuth, isSupabaseAuth, phoneOtpEnabled } from "@/lib/auth/strategy";
import {
  currentSupabaseAuthEmail,
  currentSupabaseAuthUserId,
} from "@/lib/auth/supabase-session";
import { normalizeStaffPhone } from "@/lib/phone";

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
 * primary phone is stored, in canonical E.164.
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
 * **Canonicalisation (D129).** The value is put through `normalizeStaffPhone` —
 * the same function the staff-invite route stores `merchant_staff.phone` with
 * (D127) — so the two sides of that match are canonical *by contract* rather
 * than by both happening to be E.164. D127's closure note is explicit that the
 * link previously worked "by luck, not by contract"; one shared canonicaliser is
 * what removes the luck. It is a no-op for every well-formed E.164 Clerk
 * actually returns. A number it cannot canonicalise falls through unchanged
 * rather than being dropped: an un-normalizable value could never equal a
 * normalised invite row anyway, so nulling it would lose an admin's contact
 * detail and buy nothing.
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
  const raw = primary.phoneNumber ?? null;
  if (!raw) return null;
  return normalizeStaffPhone(raw) ?? raw;
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
  const wanted = wantedColumns(columns);
  const select = columnList(wanted);

  const { data: existing } = await service
    .from("users")
    .select(select)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (existing) {
    // `users.phone` is written once, on the insert below. A user who signs up by
    // EMAIL has no verified phone at that moment, so the column is written NULL —
    // and this lookup used to return here, so verifying a phone in Clerk later
    // never reached the column again. It stayed NULL for the life of the account:
    // on production, 2026-08-19, all 10 real users rows have `phone` NULL.
    //
    // That column is what `getMerchantContext` matches a pre-invited
    // `merchant_staff` seat on (D127 canonicalised the invite side). A NULL
    // short-circuits `if (!staff && user.phone)`, so a shop assistant invited by
    // phone signs in, verifies their number to get past the claim gate, and lands
    // as an ordinary shopper with no verify keypad — nothing errors, nothing logs.
    //
    // Backfill ONLY when the column is NULL and Clerk holds a VERIFIED primary
    // phone (D126's rule, reused through `verifiedPrimaryPhone` rather than
    // restated). Never overwrite a non-NULL value: the column is an
    // access-control input that D124 froze against its own holder, and a change
    // of number is an identity event that belongs to an admin, not to a sign-in.
    //
    // Attempted only when the caller asked for `phone`. That covers every caller
    // that can act on it — `getAppUser`, and so `getMerchantContext` — while
    // keeping a Clerk Backend API round trip off the narrow paths
    // (`ensureAppUser("id")` on claim, favourites, push) for the phone-less
    // majority. Dropping `phone` from `getAppUser`'s column list would disable
    // the backfill, but it would break staff linking outright either way; the
    // coupling is pinned in `src/lib/__tests__/phone-backfill.test.ts`.
    if (wanted.has("phone") && (existing as { phone?: string | null }).phone == null) {
      const phone = verifiedPrimaryPhone(await currentUser());
      if (phone) {
        const { data: updated, error: backfillError } = await service
          .from("users")
          .update({ phone })
          .eq("clerk_user_id", userId)
          // Concurrency guard: two requests racing to backfill the same row leave
          // one winner, and the loser matches nothing and keeps the row it read.
          .is("phone", null)
          .select(select)
          .maybeSingle();
        if (backfillError) {
          // The realistic failure is a `users_phone_key` (UNIQUE) collision —
          // another account already holds this verified number, the D108 shape.
          // Degrade to the un-backfilled row rather than throwing, but say so:
          // a silent version of exactly this is the defect the backfill removes.
          // Code only — never the number itself (D85).
          console.error("users.phone backfill skipped", { code: backfillError.code });
        } else if (updated) {
          return updated as T;
        }
      }
    }
    return existing as T;
  }

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

/**
 * The columns to select: whatever the caller asked for, plus `id` and `role`,
 * which every consumer of an app user needs. Returned as a set so the Clerk path
 * can ask whether `phone` was requested before deciding to backfill it.
 */
function wantedColumns(columns: string): Set<string> {
  const wanted = new Set(
    columns
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
  );
  wanted.add("id");
  wanted.add("role");
  return wanted;
}

function columnList(wanted: Set<string>): string {
  return Array.from(wanted).join(", ");
}

function ensureColumns(columns: string): string {
  return columnList(wantedColumns(columns));
}
