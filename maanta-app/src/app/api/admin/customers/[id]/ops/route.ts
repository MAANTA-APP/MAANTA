import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";

/**
 * D171 — the write path for `users.is_blacklisted`.
 *
 * Until 2026-09-03 the admin console rendered a Blacklisted/Active chip that no
 * code could change and no code acted on. This is the missing half, built on the
 * same shape as the merchant ops route (`/api/admin/merchants/[id]/ops`):
 * `requireAdminApi` for authority, service client for the write, `logAdminOp`
 * for the durable record.
 *
 * What the action means is enforced in the database, not here:
 * `claim_deal` raises `user_blacklisted` and refuses to issue a new code, while
 * `verify_redemption` deliberately ignores the flag so a code already in a
 * shopper's hand still works at the counter (verify-anyway is a frozen rule).
 * See `20260903130000_enforce_user_blacklist.sql`.
 *
 * Two things this route does NOT do, on purpose:
 *  - it never trusts a role from the request; `requireAdminApi` resolves the
 *    caller's role server-side from their session;
 *  - it does not let an admin blacklist an admin. The console is not an
 *    instrument for locking out colleagues, and the shopper-block semantics
 *    ("issue no more deal codes") are meaningless against a staff account.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";

  const blacklisted =
    action === "blacklist" ? true : action === "unblacklist" ? false : null;
  if (blacklisted === null) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const service = createServiceClient();

  // Read the target first so the refusals below can be specific, and so the
  // response can distinguish "no such shopper" from "nothing changed".
  const { data: target, error: readError } = await service
    .from("users")
    .select("id, role, is_blacklisted")
    .eq("id", params.id)
    .maybeSingle<{ id: string; role: string; is_blacklisted: boolean }>();

  if (readError) {
    console.error("customer ops read failed:", readError);
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }
  if (target.id === auth.user.id) {
    return NextResponse.json(
      { error: "You can't blacklist your own account." },
      { status: 409 }
    );
  }
  if (target.role !== "customer") {
    return NextResponse.json(
      {
        error:
          "Blacklisting applies to shoppers. Use the merchant or staff controls for other accounts.",
      },
      { status: 409 }
    );
  }

  const { data: rows, error } = await service
    .from("users")
    .update({ is_blacklisted: blacklisted })
    .eq("id", params.id)
    .select("id, is_blacklisted");

  if (error) {
    console.error("customer ops action failed:", error);
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  await logAdminOp(service, {
    adminUserId: auth.user.id,
    action: `user.${action}`,
    targetType: "user",
    targetId: params.id,
    details: { is_blacklisted: blacklisted, previous: target.is_blacklisted },
  });

  return NextResponse.json({ ok: true, isBlacklisted: blacklisted });
}
