import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/data";
import { KpiCard } from "@/components/ui/cards";
import { LockedChip, StatusChip } from "@/components/ui/chips";
import { ButtonLink } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** 11h Agent dashboard (mobile — field rep). */
export default async function AgentDashboardPage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/agent");
  if (user.role !== "agent" && user.role !== "admin") redirect("/");

  const service = createServiceClient();
  const { data: agent } = await service
    .from("agents")
    .select("id, weekly_target")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!agent) {
    return (
      <main className="mx-auto max-w-mobile px-6 py-24 text-center">
        <p className="text-sm font-semibold text-ink">No agent profile found.</p>
        <p className="mt-1 text-xs text-muted">Ask the Maanta team to set you up.</p>
      </main>
    );
  }

  const weekStart = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const [{ data: recentLeads }, { count: convertedWeek }, { count: onboarded }] =
    await Promise.all([
      service
        .from("leads")
        .select("id, shop_name, status, locked_until")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: false })
        .limit(5),
      service
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent.id)
        .eq("status", "converted")
        .gte("created_at", weekStart),
      service
        .from("merchants")
        .select("id", { count: "exact", head: true })
        .eq("onboarded_by", agent.id),
    ]);

  const done = convertedWeek ?? 0;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-mobile border-x border-line bg-white px-4 pb-10 pt-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">
          Agent · {user.full_name ?? "Field rep"}
        </h1>
        <span className="rounded-full bg-cream px-3 py-1 text-xs font-bold text-ink">
          BBS Mall
        </span>
      </div>

      <div className="mt-5 rounded-card border border-line bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Weekly target</span>
          <span className="text-sm font-bold text-ink">
            {done} / {agent.weekly_target} shops
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream">
          <div
            className="h-full bg-brand"
            style={{ width: `${Math.min(100, (done / agent.weekly_target) * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <KpiCard label="Leads converted" value={done} />
        <KpiCard label="Shops onboarded" value={onboarded ?? 0} />
      </div>

      <div className="mt-5">
        <ButtonLink href="/agent/leads/new" full>
          + New lead
        </ButtonLink>
      </div>

      <h2 className="mt-6 text-base font-bold text-ink">Recent leads</h2>
      <div className="mt-2 space-y-2.5">
        {(recentLeads ?? []).length === 0 ? (
          <p className="rounded-card border border-line bg-white px-4 py-6 text-center text-sm text-muted">
            No leads yet — lock your first one
          </p>
        ) : (
          (recentLeads ?? []).map((l) => {
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
      <Link
        href="/agent/leads"
        className="mt-3 block text-center text-xs font-semibold text-muted underline"
      >
        My leads
      </Link>
    </main>
  );
}
