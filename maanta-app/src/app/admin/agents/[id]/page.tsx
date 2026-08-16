import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { StatusChip, LockedChip } from "@/components/ui/chips";
import { KpiCard } from "@/components/ui/cards";
import { IconArrowLeft } from "@/components/ui/icons";
import { friendlyTime } from "@/lib/ui";
import { summariseAgentLeads, lockHoursLeft } from "@/lib/agent-summary";

export const dynamic = "force-dynamic";

/**
 * Admin agent detail — everything the product knows about one field agent.
 *
 * Admin and HR are one role at launch, so this is where an admin answers "who is
 * this person and what have they actually done". Read-only by design: activating
 * or retargeting an agent is a mutation with its own audit questions, and no such
 * mutation existed before this screen — adding one is a separate decision.
 */
export default async function AdminAgentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminPage();

  const service = createServiceClient();
  const { data: agent } = await service
    .from("agents")
    .select("id, weekly_target, is_active, created_at, users(full_name, phone, email, role)")
    .eq("id", params.id)
    .maybeSingle();
  if (!agent) notFound();

  const [{ data: leads }, { data: assisted }] = await Promise.all([
    service
      .from("leads")
      .select("id, shop_name, status, locked_until, created_at, converted_to")
      .eq("agent_id", params.id)
      .order("created_at", { ascending: false })
      .limit(100),
    // The payoff of agent attribution, which until now rendered nowhere: the
    // merchants this agent assisted onto the platform.
    service
      .from("merchants")
      .select("id, merchant_name, status, node, created_at")
      .eq("assisted_by_agent_id", params.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const u = agent.users as unknown as {
    full_name: string | null;
    phone: string | null;
    email: string | null;
    role: string | null;
  } | null;

  const now = Date.now();
  const rows = leads ?? [];
  const s = summariseAgentLeads(rows, now);
  const merchants = assisted ?? [];

  return (
    <main className="max-w-3xl">
      <Link
        href="/admin/agents"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-ink"
      >
        <IconArrowLeft className="h-4 w-4" />
        Agents
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">
          {u?.full_name ?? u?.phone ?? "Agent"}
        </h1>
        <StatusChip
          status={agent.is_active ? "active" : "paused"}
          label={agent.is_active ? "Active" : "Inactive"}
        />
      </div>

      <p className="mt-2 text-sm text-muted">
        {u?.phone ?? "No phone on file"}
        {u?.email ? ` · ${u.email}` : ""}
      </p>
      <p className="mt-1 text-sm text-muted">
        Role {u?.role ?? "unknown"} · Joined {friendlyTime(agent.created_at)} · Weekly target{" "}
        {agent.weekly_target} shops
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Converted (7d)" value={`${s.convertedThisWeek} / ${agent.weekly_target}`} />
        <KpiCard label="Leads total" value={s.total.toLocaleString()} />
        <KpiCard
          label="Conversion rate"
          value={s.conversionRate === null ? "—" : `${Math.round(s.conversionRate * 100)}%`}
        />
        <KpiCard label="Merchants assisted" value={merchants.length.toLocaleString()} />
      </div>

      <h2 className="mt-8 text-base font-bold text-ink">Merchants assisted</h2>
      <p className="mt-1 text-xs text-muted">
        Onboarding submitted by the merchant themselves, with this agent recorded as the
        assist.
      </p>
      <div className="mt-2 space-y-2">
        {merchants.length === 0 ? (
          <p className="rounded-card border border-line bg-white px-4 py-6 text-center text-sm text-muted">
            No merchants attributed to this agent yet
          </p>
        ) : (
          merchants.map((m) => (
            <Link
              key={m.id}
              href={`/admin/merchants/${m.id}`}
              className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3 hover:bg-stone-soft"
            >
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                {m.merchant_name}
              </span>
              <span className="text-xs text-muted">{m.node}</span>
              <span className="text-xs text-muted">{friendlyTime(m.created_at)}</span>
              <StatusChip status={m.status} />
            </Link>
          ))
        )}
      </div>

      <h2 className="mt-8 text-base font-bold text-ink">
        Leads{" "}
        <span className="text-sm font-semibold text-muted">
          {s.locked} locked · {s.converted} converted · {s.expired} expired · {s.lost} lost
        </span>
      </h2>
      <div className="mt-2 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-card border border-line bg-white px-4 py-6 text-center text-sm text-muted">
            No leads captured yet
          </p>
        ) : (
          rows.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3"
            >
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                {l.shop_name}
              </span>
              <span className="text-xs text-muted">{friendlyTime(l.created_at)}</span>
              {l.status === "locked" ? (
                <LockedChip hoursLeft={lockHoursLeft(l.locked_until, now)} />
              ) : (
                <StatusChip status={l.status} />
              )}
            </div>
          ))
        )}
      </div>

      {/* Said plainly rather than left for an admin to wonder about: HR-shaped data
          is not in the product. Combining the roles at launch does not create the
          records, and a page that looks complete would imply it had. */}
      <p className="mt-8 text-xs text-muted">
        This page shows what the product records: identity, status, target and field results.
        Employment records, rota and shift history are not in the database — the rota is run
        manually. Agent details are edited by changing the underlying user and agent rows.
      </p>
    </main>
  );
}
