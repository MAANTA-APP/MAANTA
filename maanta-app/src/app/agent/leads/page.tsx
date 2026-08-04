import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAgentPage } from "@/lib/agent";
import { canWriteAgentLeads } from "@/lib/roles";
import { LeadRowList } from "@/components/agent/lead-row-list";
import { IconArrowLeft } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

/**
 * 11i "My leads".
 *
 * "My" is literal for a field rep: their own `agents` row's leads. A co-founder
 * has no such row, so for them this is the whole pipeline, titled accordingly —
 * an empty "My leads" would be a lie about the data rather than a real state.
 */
export default async function MyLeadsPage() {
  // requireAgentPage owns the guard and the agents-row lookup, and returns
  // agentId null for a reader who does not own leads.
  const { user, agentId } = await requireAgentPage("/agent/leads");
  const service = createServiceClient();
  const ownsLeads = canWriteAgentLeads(user.role);

  const { data: leads } = !ownsLeads
    ? await service
        .from("leads")
        .select("id, shop_name, status, locked_until, created_at")
        .order("created_at", { ascending: false })
        .limit(50)
    : agentId
      ? await service
          .from("leads")
          .select("id, shop_name, status, locked_until, created_at")
          .eq("agent_id", agentId)
          .order("created_at", { ascending: false })
      : { data: [] };

  return (
    <main className="mx-auto min-h-dvh w-full max-w-mobile border-x border-line bg-white px-4 pb-10 pt-5">
      <div className="flex items-center gap-3">
        <Link href="/agent" aria-label="Back" className="p-1">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-center text-lg font-bold text-ink">
          {ownsLeads ? "My leads" : "All leads"}
        </h1>
        <span className="w-7" />
      </div>

      <div className="mt-5 space-y-2.5">
        <LeadRowList leads={leads ?? []} emptyLabel="No leads yet" />
      </div>
    </main>
  );
}
