import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";
import { staffFacingName, type QueueEntry } from "@/lib/queue";

/**
 * The staff view of the merchant's shopper queue.
 *
 * Tenant isolation is app-layer, exactly like the redemption preflight: the
 * service client bypasses RLS, so the `.eq("merchant_id", ctx.merchant.id)`
 * predicate IS the boundary — it comes from the authenticated merchant
 * context, never from the request. Dropping or reordering it is a
 * cross-tenant read.
 *
 * Identity minimisation (§26): the payload carries first name + last initial
 * (`staffFacingName`), the deal title, the arrival time, Fast Visit
 * eligibility and the claim code — the code so a tapped row feeds the
 * EXISTING keypad flow (resolve → fee disclosure → Confirm), which stays the
 * only money path. Full name, phone, email and anything else never leave
 * the server.
 *
 * Redeemed, cancelled, dismissed and timed-out entries all drop out here:
 * status + expiry are filtered in the query, and a ticket verified since
 * check-in is dropped by the join to the live redemption.
 */
export async function GET() {
  const auth = await requireMerchant("can_verify");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  const service = createServiceClient();
  const { data, error } = await service
    .from("merchant_presentations")
    .select(
      "id, arrived_at, fast_visit_eligible, status, called_at, users(full_name), redemptions(otp_code, status, expires_at, deals(title))"
    )
    .eq("merchant_id", merchant.id)
    .in("status", ["waiting", "called"])
    .gt("expires_at", new Date().toISOString())
    .order("arrived_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Could not load the queue." },
      { status: 500 }
    );
  }

  type Row = {
    id: string;
    arrived_at: string;
    fast_visit_eligible: boolean;
    status: "waiting" | "called";
    called_at: string | null;
    users: { full_name: string | null } | null;
    redemptions: {
      otp_code: string;
      status: string;
      expires_at: string;
      deals: { title: string } | null;
    } | null;
  };

  const now = Date.now();
  const entries: QueueEntry[] = ((data ?? []) as unknown as Row[])
    .filter(
      (row) =>
        row.redemptions?.status === "pending" &&
        new Date(row.redemptions.expires_at).getTime() > now
    )
    .map((row) => ({
      id: row.id,
      name: staffFacingName(row.users?.full_name),
      dealTitle: row.redemptions?.deals?.title ?? "Deal",
      arrivedAt: row.arrived_at,
      fastVisitEligible: row.fast_visit_eligible,
      status: row.status,
      calledAt: row.called_at,
      code: row.redemptions?.otp_code ?? "",
    }));

  return NextResponse.json({ entries, count: entries.length });
}
