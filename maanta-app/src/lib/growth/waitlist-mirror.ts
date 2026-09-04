import { createServiceClient } from "@/lib/supabase/service";
import { WAITLIST_CONSENT_TEXT, WAITLIST_NODE_INTEREST, type WaitlistSubmission } from "@/lib/waitlist";
import { resendPropertyValue, type WaitlistContactResult } from "@/lib/resend";

/**
 * The Supabase side of a waitlist signup (founder ruling 2026-09-04, D261).
 *
 * Resend stays the sender of record — it owns deliverability, duplicate
 * detection and the join date. This table owns COUNTING, so the admin console
 * can filter and aggregate server-side instead of walking the audience one
 * contact at a time and capping itself at 500.
 *
 * ## Never log the error message on an email-keyed write
 *
 * The most likely failure here is a unique violation, and Postgres renders it as
 * `Key (lower(email))=(someone@example.com) already exists`. PostgrestError
 * carries that verbatim, so `console.error(err.message)` would put a real
 * person's address in the server log — the exact leak `/api/waitlist` already
 * goes out of its way to avoid by logging the segment and not the address
 * (SEC-011). Log `code` and a fixed string. Never `message`, never the object.
 */

function logMirrorFailure(what: string, error: { code?: string } | null) {
  console.error(`waitlist mirror: ${what} failed`, { code: error?.code ?? "unknown" });
}

export type MirrorOutcome = "inserted" | "existing" | "failed";

/**
 * Record the signup, then fold in what Resend said.
 *
 * Ordering is Resend-first (the caller does that), then this. Resend is the one
 * that can tell us `already_exists`, and it is the one whose failure the user
 * must see — a mirror row for a person who never got into the sending audience
 * would be a signup that receives nothing.
 *
 * The insert is `ON CONFLICT DO NOTHING` on `lower(email)`: a repeat submission
 * from an unauthenticated caller must be a NO-OP on the row, never an update and
 * never a counter an anonymous prober can drive.
 *
 * `joined_at` is deliberately not written here. Resend's create response carries
 * no `created_at`, and on the `already_exists` branch the true join date may be
 * months old — writing NOW() would move a historical signup into today's chart.
 * It stays NULL until a sync reads it.
 */
export async function mirrorWaitlistSignup(
  submission: WaitlistSubmission,
  resend: WaitlistContactResult
): Promise<MirrorOutcome> {
  const service = createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await service
    .from("waitlist_signups")
    .upsert(
      {
        // Already lowercased by `validateWaitlistSubmission`; the column's CHECK
        // enforces it, and `ON CONFLICT (email)` below depends on it.
        email: submission.email,
        full_name: submission.fullName,
        phone: submission.phone,
        segment: submission.segment,
        node_interest: WAITLIST_NODE_INTEREST,
        business_name: submission.businessName,
        // `note` is deliberately not mirrored — free text the console never
        // renders, and a second copy of it earns nothing. Resend still holds it.
        utm_source: submission.utmSource,
        utm_medium: submission.utmMedium,
        utm_campaign: submission.utmCampaign,
        consent_at: now,
        consent_text: WAITLIST_CONSENT_TEXT,
        is_test: submission.isTest,
        test_label: submission.testLabel,
        signup_source: "public_form",
        resend_contact_id: resend.contactId,
        resend_status: resend.outcome === "failed" ? "failed" : resend.outcome,
        resend_synced_at: resend.outcome === "failed" ? null : now,
        // A live-path row is never unreadable: this route wrote every property
        // itself. The table's CHECK enforces that independently.
        properties_unreadable: false,
        updated_at: now,
      },
      { onConflict: "email", ignoreDuplicates: true }
    )
    .select("id");

  if (error) {
    logMirrorFailure("upsert", error);
    return "failed";
  }
  // `ignoreDuplicates` returns no row when the address was already present.
  return data && data.length > 0 ? "inserted" : "existing";
}

/**
 * Fold a Resend read into an existing mirror row.
 *
 * Used by the sync pass. Two rules, both learned the hard way in review:
 *
 * 1. **The join date is last-write-wins from a SUCCESSFUL read, never floored.**
 *    A value we hold is only ever replaced by a better read. Merging it
 *    monotonically (`LEAST`) would let one bad read pin the row to that value
 *    forever, with no later correct read able to win.
 * 2. **An empty properties object means unreadable, not empty.** It is the
 *    footprint of `addWaitlistContact`'s strip-and-retry. Treating it as "they
 *    provided nothing" would raise a consent defect against someone who did
 *    consent.
 */
export function mirrorPatchFromResend(detail: {
  contactId: string;
  createdAt: string | null;
  properties: Record<string, unknown> | null;
}): Record<string, unknown> {
  const unreadable =
    detail.properties === null ||
    Object.keys(detail.properties).length === 0 ||
    // A non-empty object none of whose expected keys can be read is a shape
    // mismatch, and importing it as "they provided nothing" is worse than
    // admitting we could not read it. Resend returns properties TYPED
    // ({value,type}) while we write them flat, which is exactly how such a
    // mismatch arises — `resendPropertyValue` tolerates both.
    (resendPropertyValue(detail.properties, "segment_type") === null &&
      resendPropertyValue(detail.properties, "consent_at") === null &&
      resendPropertyValue(detail.properties, "node_interest") === null);

  const patch: Record<string, unknown> = {
    resend_contact_id: detail.contactId,
    resend_synced_at: new Date().toISOString(),
    properties_unreadable: unreadable,
    updated_at: new Date().toISOString(),
  };
  // Only ever set from a real value. A null read leaves what we already had.
  if (detail.createdAt) patch.joined_at = detail.createdAt;
  return patch;
}
