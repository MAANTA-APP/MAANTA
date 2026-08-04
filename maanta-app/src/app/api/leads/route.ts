import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireActiveAgentApi } from "@/lib/agent";

/**
 * 11i Lead capture. The 48h lock comes from the DB default
 * (leads.locked_until = NOW() + 48 hours) — not re-implemented here.
 *
 * Authorization is `requireActiveAgentApi`, which this route used to restate
 * inline — the same role check, the same active-`agents`-row lookup and the same
 * 401/403/404 responses, in two places. That is one place too many for a write
 * guard: a change to who may capture a lead has to reach both, and the copy that
 * gets missed is the one that stays permissive.
 */
export async function POST(request: Request) {
  const guard = await requireActiveAgentApi();
  if ("error" in guard) return guard.error;

  const service = createServiceClient();
  const { shopName, ownerName, phone, unitNumber, what3words, notes } =
    await request.json();
  if (!shopName) {
    return NextResponse.json({ error: "Shop name is required." }, { status: 400 });
  }

  const { data: lead, error } = await service
    .rpc("capture_lead", {
      p_agent_id: guard.agentId,
      p_shop_name: String(shopName).trim(),
      p_owner_name: ownerName || null,
      p_phone: phone || null,
      p_unit_number: unitNumber || null,
      p_what3words_address: what3words
        ? String(what3words).replace(/^\/+/, "").toLowerCase()
        : null,
      p_notes: notes || null,
    })
    .single<{ lead_id: string; locked_until: string }>();

  if (error || !lead) {
    const message = error?.message ?? "";
    if (message.includes("shop_locked")) {
      return NextResponse.json(
        { error: "This shop is already locked by a lead." },
        { status: 409 }
      );
    }
    console.error("capture_lead RPC failed:", error);
    return NextResponse.json({ error: "Could not save the lead." }, { status: 500 });
  }

  return NextResponse.json({ leadId: lead.lead_id, lockedUntil: lead.locked_until });
}
