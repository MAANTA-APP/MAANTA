import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireActiveAgentApi } from "@/lib/agent";

/**
 * G4 — link a lead to the merchant it became.
 *
 * Writes leads.converted_to + status='converted'. Attribution only — no money
 * or ledger effects. Both the lead (agent_id) and the target merchant
 * (onboarded_by) must belong to the calling agent, so an agent can neither
 * touch another agent's lead nor claim a shop they didn't onboard.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const { agentId } = auth;

  const { merchantId } = await request.json().catch(() => ({}));
  if (!merchantId) {
    return NextResponse.json({ error: "Pick a merchant to link." }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: lead } = await service
    .from("leads")
    .select("id, agent_id, converted_to")
    .eq("id", params.id)
    .maybeSingle();
  if (!lead || lead.agent_id !== agentId) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }
  if (lead.converted_to) {
    return NextResponse.json(
      { error: "This lead is already linked to a merchant." },
      { status: 409 }
    );
  }

  // The merchant must be one this agent onboarded.
  const { data: merchant } = await service
    .from("merchants")
    .select("id, onboarded_by")
    .eq("id", merchantId)
    .maybeSingle();
  if (!merchant || merchant.onboarded_by !== agentId) {
    return NextResponse.json(
      { error: "You can only link shops you onboarded." },
      { status: 403 }
    );
  }

  // One lead per merchant — don't let two leads claim the same shop.
  const { data: clash } = await service
    .from("leads")
    .select("id")
    .eq("converted_to", merchantId)
    .maybeSingle();
  if (clash) {
    return NextResponse.json(
      { error: "That shop is already linked to another lead." },
      { status: 409 }
    );
  }

  const { error } = await service
    .from("leads")
    .update({ converted_to: merchantId, status: "converted" })
    .eq("id", params.id);
  if (error) {
    console.error("lead link failed:", error);
    return NextResponse.json({ error: "Could not link the lead." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
