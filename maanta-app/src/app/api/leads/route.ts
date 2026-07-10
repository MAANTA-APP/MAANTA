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

  // A live lock on the same shop name blocks a duplicate capture.
  const { data: existing } = await service
    .from("leads")
    .select("id, locked_until")
    .ilike("shop_name", shopName)
    .eq("status", "locked")
    .gt("locked_until", new Date().toISOString())
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "This shop is already locked by a lead." },
      { status: 409 }
    );
  }

  const { data: lead, error } = await service
    .from("leads")
    .insert({
      agent_id: agent.id,
      shop_name: String(shopName).trim(),
      owner_name: ownerName || null,
      phone: phone || null,
      unit_number: unitNumber || null,
      what3words_address: what3words
        ? String(what3words).replace(/^\/+/, "").toLowerCase()
        : null,
      notes: notes || null,
    })
    .select("id, locked_until")
    .single();

  if (error || !lead) {
    console.error("lead insert failed:", error);
    return NextResponse.json({ error: "Could not save the lead." }, { status: 500 });
  }

  return NextResponse.json({ leadId: lead.id, lockedUntil: lead.locked_until });
}
