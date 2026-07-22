import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/data";

/**
 * 11i Lead capture. The 48h lock comes from the DB default
 * (leads.locked_until = NOW() + 48 hours) — not re-implemented here.
 */
export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (user.role !== "agent" && user.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: agent } = await service
    .from("agents")
    .select("id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!agent || !agent.is_active) {
    return NextResponse.json({ error: "No active agent profile." }, { status: 404 });
  }

  const { shopName, ownerName, phone, unitNumber, what3words, notes } =
    await request.json();
  if (!shopName) {
    return NextResponse.json({ error: "Shop name is required." }, { status: 400 });
  }

  const { data: lead, error } = await service
    .rpc("capture_lead", {
      p_agent_id: agent.id,
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
