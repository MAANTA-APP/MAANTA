import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { LockedChip, StatusChip } from "@/components/ui/chips";
import { IconChevronRight } from "@/components/ui/icons";
import { AdminReadError } from "@/components/admin/read-error";

export const dynamic = "force-dynamic";

/** Agents overview (11g sidebar item) — field reps, targets, recent leads. */
export default async function AdminAgentsPage() {
  await requireAdminPage();

  const service = createServiceClient();
  const [agentsRes, leadsRes] = await Promise.all([
    service
      .from("agents")
      .select("id, weekly_target, is_active, users(full_name, phone)")
      .order("created_at", { ascending: true }),
    service
      .from("leads")
      .select("id, shop_name, status, locked_until, agent_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const weekStart = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const convertedRes = await service
    .from("leads")
    .select("agent_id")
    .eq("status", "converted")
    .gte("created_at", weekStart);
  if (agentsRes.error || leadsRes.error || convertedRes.error) {
    return (
      <main className="max-w-4xl">
        <h1 className="text-2xl font-bold text-ink">Agents</h1>
        <div className="mt-5"><AdminReadError what="agent operations" /></div>
      </main>
    );
  }

  const agents = agentsRes.data;
  const leads = leadsRes.data;
  const converted = convertedRes.data;
  const convertedByAgent = new Map<string, number>();
  for (const l of converted ?? []) {
    convertedByAgent.set(l.agent_id, (convertedByAgent.get(l.agent_id) ?? 0) + 1);
  }

  return (
    <main className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">Agents</h1>

      <div className="mt-5 space-y-3">
        {(agents ?? []).length === 0 ? (
          <p className="rounded-card bg-white shadow-card px-4 py-8 text-center text-sm text-muted">
            No field agents yet
          </p>
        ) : (
          (agents ?? []).map((a) => {
            const u = a.users as unknown as { full_name: string | null; phone: string | null } | null;
            const done = convertedByAgent.get(a.id) ?? 0;
            return (
              <Link
                key={a.id}
                href={`/admin/agents/${a.id}`}
                className="flex flex-wrap items-center gap-3 rounded-card bg-white shadow-card px-4 py-3.5 hover:bg-stone-soft"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">
                    {u?.full_name ?? u?.phone ?? "Agent"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Weekly target: {done} / {a.weekly_target} shops
                  </p>
                </div>
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-cream">
                  <div
                    className="h-full bg-brand"
                    style={{ width: `${a.weekly_target > 0 ? Math.min(100, (done / a.weekly_target) * 100) : 0}%` }}
                  />
                </div>
                {!a.is_active ? <StatusChip status="paused" label="Inactive" /> : null}
                <IconChevronRight className="h-4 w-4 text-muted" aria-hidden />
              </Link>
            );
          })
        )}
      </div>

      <h2 className="mt-8 text-base font-bold text-ink">Recent leads</h2>
      <div className="mt-2 space-y-2.5">
        {(leads ?? []).map((l) => {
          const hoursLeft = Math.max(
            0,
            Math.round((new Date(l.locked_until).getTime() - Date.now()) / 3600_000)
          );
          return (
            <div
              key={l.id}
              className="flex items-center justify-between rounded-card bg-white shadow-card px-4 py-3"
            >
              <span className="text-sm font-semibold text-ink">{l.shop_name}</span>
              {l.status === "locked" && hoursLeft > 0 ? (
                <LockedChip hoursLeft={hoursLeft} />
              ) : (
                <StatusChip status={l.status} />
              )}
            </div>
          );
        })}
        {(leads ?? []).length === 0 ? (
          <p className="rounded-card bg-white shadow-card px-4 py-6 text-center text-sm text-muted">
            No leads captured yet
          </p>
        ) : null}
      </div>
    </main>
  );
}
