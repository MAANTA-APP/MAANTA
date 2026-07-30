import { redirect } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/data";
import { hasAgentConsoleAccess } from "@/lib/roles";
import { LockedChip, StatusChip } from "@/components/ui/chips";
import { IconArrowLeft } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

/** 11i "My leads". */
export default async function MyLeadsPage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/agent/leads");
  if (!hasAgentConsoleAccess(user)) redirect("/");

  const service = createServiceClient();
  const { data: agent } = await service
    .from("agents")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: leads } = agent
    ? await service
        .from("leads")
        .select("id, shop_name, status, locked_until, created_at")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <main className="mx-auto min-h-dvh w-full max-w-mobile border-x border-line bg-white px-4 pb-10 pt-5">
      <div className="flex items-center gap-3">
        <Link href="/agent" aria-label="Back" className="p-1">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-center text-lg font-bold text-ink">My leads</h1>
        <span className="w-7" />
      </div>

      <div className="mt-5 space-y-2.5">
        {(leads ?? []).length === 0 ? (
          <p className="rounded-card border border-line bg-white px-4 py-8 text-center text-sm text-muted">
            No leads yet
          </p>
        ) : (
          (leads ?? []).map((l) => {
            const hoursLeft = Math.max(
              0,
              Math.round((new Date(l.locked_until).getTime() - Date.now()) / 3600_000)
            );
            return (
              <Link
                key={l.id}
                href={`/agent/leads/${l.id}`}
                className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5 hover:bg-cream/50"
              >
                <span className="text-sm font-bold text-ink">{l.shop_name}</span>
                {l.status === "locked" && hoursLeft > 0 ? (
                  <LockedChip hoursLeft={hoursLeft} />
                ) : (
                  <StatusChip status={l.status} />
                )}
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}
