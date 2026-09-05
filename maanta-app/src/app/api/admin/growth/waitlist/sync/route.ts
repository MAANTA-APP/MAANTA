import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getAudienceContact,
  isResendConfigured,
  listAudienceContacts,
  resendPropertyValue,
} from "@/lib/resend";
import { normalizeWaitlistPhone, isWaitlistSegment } from "@/lib/waitlist";
import { mirrorPatchFromResend } from "@/lib/growth/waitlist-mirror";

export const dynamic = "force-dynamic";

/**
 * Import the Resend audience into the mirror, and confirm what the mirror
 * already holds.
 *
 * The mirror only started collecting at the 2026-09-04 cutover, so everyone who
 * joined before it exists only in Resend. This route is how they arrive, and how
 * a row whose `joined_at` was never read gets one.
 *
 * ## Dry run by default
 *
 * `{ confirm: false }` (the default) walks a page, reports exactly what it would
 * do, and writes nothing — the same result shape either way. That mirrors
 * `wipe_demo_data(p_confirm boolean DEFAULT FALSE)`, the repo's only other bulk
 * mutation. Reading several hundred people's personal data out of Resend is the
 * reveal route's class of act, not a refresh button.
 *
 * ## Audit before act, not best-effort
 *
 * The `admin_ops_log` insert happens BEFORE the walk and a failure returns 503.
 * `logAdminOp` is deliberately not used: it swallows its own failure, which is
 * right for a stage change and wrong for a bulk read of personal data.
 *
 * ## Nothing is ever deleted here
 *
 * A contact absent from a Resend page is NOT removed from the mirror. A paging
 * hiccup would otherwise erase real people, and "the read failed" must never
 * present as "these people are gone" — the D242/D246/D251/D253 lesson.
 */

const PAGE_SIZE = 100;

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  if (!isResendConfigured()) {
    return NextResponse.json(
      { error: "Resend is not configured, so there is nothing to sync from." },
      { status: 503 }
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is a dry run.
  }
  const confirm = (body as { confirm?: unknown })?.confirm === true;
  const after = typeof (body as { after?: unknown })?.after === "string"
    ? ((body as { after: string }).after)
    : undefined;

  const service = createServiceClient();

  const { error: auditError } = await service.from("admin_ops_log").insert({
    admin_user_id: auth.user.id,
    action: confirm ? "growth.waitlist.sync" : "growth.waitlist.sync.dry_run",
    target_type: "waitlist_contact",
    target_id: auth.user.id,
    details: { confirm, after: after ?? null, pageSize: PAGE_SIZE },
  });
  if (auditError) {
    console.error("growth: sync audit write failed", { code: auditError.code });
    return NextResponse.json(
      { error: "Could not record the sync, so it did not run." },
      { status: 503 }
    );
  }

  const page = await listAudienceContacts({ limit: PAGE_SIZE, after });
  if (!page) {
    return NextResponse.json({ error: "Could not read the audience." }, { status: 502 });
  }

  // Four classes, not one "failed" count: a row that could not be imported must
  // be reported as WHY, never silently folded into a total.
  const result = {
    scanned: page.contacts.length,
    imported: 0,
    updated: 0,
    unreadable: 0,
    failed: 0,
    applied: confirm,
    hasMore: page.hasMore,
    nextAfter: page.contacts.length > 0 ? page.contacts[page.contacts.length - 1].id : null,
  };

  for (const summary of page.contacts) {
    const detail = await getAudienceContact(summary.id);
    // A failed per-contact read is reported, not skipped silently, and never
    // written as an empty row that would look like a person with no metadata.
    if (!detail) {
      result.unreadable += 1;
      continue;
    }

    const props = detail.properties;
    // Three states: null = unreadable, {} = we stripped it on a 4xx retry and it
    // is ALSO unreadable, populated = provided.
    //
    // A fourth would be worse than all of them: an object that is not empty but
    // whose values this code cannot read. That is what a shape mismatch looks
    // like, and it would import a person with every field null while claiming
    // their metadata was fine. So a contact carrying NONE of the properties this
    // audience is configured for is treated as unreadable too — the account has
    // ten configured, and a real contact has at least `segment_type` or
    // `consent_at`.
    const shapeReadable =
      resendPropertyValue(props, "segment_type") !== null ||
      resendPropertyValue(props, "consent_at") !== null ||
      resendPropertyValue(props, "node_interest") !== null;
    const unreadable = props === null || Object.keys(props).length === 0 || !shapeReadable;
    if (unreadable) result.unreadable += 1;

    if (!confirm) continue;

    const segmentValue = resendPropertyValue(props, "segment_type");
    const patch = mirrorPatchFromResend({
      contactId: detail.id,
      createdAt: detail.created_at,
      unsubscribed: detail.unsubscribed,
      properties: props,
    });

    // Insert-then-update, NOT a blind upsert.
    //
    // A single `upsert` here was wrong twice over. First, PostgREST builds the
    // INSERT column list from the payload keys, and `resend_status` is NOT NULL
    // with no DEFAULT — omitting it made every new contact fail 23502, so the
    // backfill imported nobody, on every page, forever. Second, an upsert's
    // DO UPDATE overwrites every column in the payload, which would have
    // rewritten a live public_form row's `signup_source` to 'backfill' and
    // reset its `is_test` and `segment` from whatever Resend happened to hold.
    //
    // So: insert new contacts only, then patch existing ones with just the
    // columns Resend actually owns. The public form's own record of a person is
    // never overwritten by a later sync.
    const { data: inserted, error: insertError } = await service
      .from("waitlist_signups")
      .insert({
        // Lowercased to satisfy the table's invariant — Resend echoes whatever
        // case the person typed, and the column requires email = lower(email).
        email: detail.email.trim().toLowerCase(),
        full_name:
          [detail.first_name, detail.last_name].filter(Boolean).join(" ").trim() || null,
        phone: normalizeWaitlistPhone(resendPropertyValue(props, "phone")),
        // A contact whose segment Resend would not return still belongs in the
        // mirror — the column is nullable for backfilled rows precisely so this
        // is recorded as unknown rather than guessed. The console counts it
        // under "Role unreadable".
        segment: isWaitlistSegment(segmentValue) ? segmentValue : null,
        node_interest: resendPropertyValue(props, "node_interest"),
        utm_source: resendPropertyValue(props, "source_channel"),
        utm_medium: resendPropertyValue(props, "source_medium"),
        utm_campaign: resendPropertyValue(props, "source_campaign"),
        consent_at: resendPropertyValue(props, "consent_at"),
        consent_text: resendPropertyValue(props, "consent_text"),
        // Resend does not carry the TEST marker (see lib/resend.ts) — a backfilled
        // contact is a real signup unless the mirror already says otherwise.
        is_test: false,
        test_label: null,
        signup_source: "backfill",
        // Resend holds this contact and we did not create it in this call.
        // Required: the column has no default, deliberately.
        resend_status: "already_exists",
        ...patch,
      })
      .select("id");

    if (!insertError && inserted && inserted.length > 0) {
      result.imported += 1;
      continue;
    }

    // 23505 = the address is already mirrored. That is the normal path for a
    // post-cutover signup, and it is the case we patch rather than skip.
    if (insertError && insertError.code !== "23505") {
      // Code only — a unique violation on this table renders the address.
      console.error("growth: sync insert failed", { code: insertError.code });
      result.failed += 1;
      continue;
    }

    // Only what Resend owns. Never signup_source, is_test, segment or consent
    // — those are the public form's record of what the person actually said.
    //
    // `properties_unreadable` is a backfill-only column: the table's CHECK says
    // so, because a public_form row was written property-by-property by the
    // form itself and nothing about it is unreadable no matter what Resend
    // hands back today. Carrying the flag into an update on a live-path row
    // would trip that constraint — and because this loop counts a failed update
    // as `failed` and moves on, that one contact would then fail on EVERY sync
    // for as long as Resend kept returning that shape. So the full patch goes
    // to backfilled rows, and a live-path row gets the same patch minus the
    // flag. Exactly one of the two matches; the second runs only if the first
    // touched nothing.
    const lowered = detail.email.trim().toLowerCase();
    const { data: patchedBackfill, error: updateError } = await service
      .from("waitlist_signups")
      .update(patch)
      .eq("email", lowered)
      .eq("signup_source", "backfill")
      .select("id");

    if (updateError) {
      console.error("growth: sync update failed", { code: updateError.code });
      result.failed += 1;
      continue;
    }

    if (!patchedBackfill || patchedBackfill.length === 0) {
      const livePatch = { ...patch };
      delete livePatch.properties_unreadable;
      const { error: liveError } = await service
        .from("waitlist_signups")
        .update(livePatch)
        .eq("email", lowered)
        .eq("signup_source", "public_form");
      if (liveError) {
        console.error("growth: sync update failed", { code: liveError.code });
        result.failed += 1;
        continue;
      }
    }
    result.updated += 1;
  }

  return NextResponse.json(result);
}
