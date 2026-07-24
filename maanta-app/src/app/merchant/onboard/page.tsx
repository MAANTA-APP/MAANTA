import { getSuccessFee } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/service";
import { OnboardWizard, type OnboardAgent } from "./onboard-wizard";

export const dynamic = "force-dynamic";

/** 9b–9j Merchant onboarding — server shell fetches the canonical success fee
 * and the roster of active field agents, and hands both to the client wizard.
 * The success fee drives the wallet-step copy; the agent roster powers the G1
 * "Were you helped by a Maanta agent?" attribution picker. The merchant remains
 * the authenticated submitter — the agent is captured as attribution only. */
export default async function MerchantOnboardPage() {
  const successFee = await getSuccessFee();

  // Active agents only, id + display name. Read with the service client (the
  // signed-in caller is a not-yet-merchant customer with no rights to the
  // agents table); we project just what the picker needs, never PII beyond the
  // agent's display name.
  const service = createServiceClient();
  const { data: agentRows } = await service
    .from("agents")
    .select("id, users(full_name)")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const agents: OnboardAgent[] = (agentRows ?? []).map((a) => {
    const u = a.users as unknown as { full_name: string | null } | null;
    return { id: a.id, name: u?.full_name?.trim() || "Maanta agent" };
  });

  return <OnboardWizard successFee={successFee} agents={agents} />;
}
