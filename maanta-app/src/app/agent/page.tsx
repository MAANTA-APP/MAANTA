import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/data";
import { canViewAgentConsole, canWriteAgentLeads } from "@/lib/roles";
import { KpiCard } from "@/components/ui/cards";
import { LeadRowList } from "@/components/agent/lead-row-list";
import { ButtonLink } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * 11h Agent dashboard (mobile — field rep).
 *
 * Two audiences. A field rep or admin gets the working console below: weekly
 * target, their own leads, and the "+ New lead" action. A co-founder gets the
 * read-only pipeline view — same data shape, no write affordances — because
 * `canWriteAgentLeads` excludes them and lead writes are attributed to an
 * `agents` row they do not have. Rendering the button anyway would offer an
 * action that 403s, which is worse than not offering it.
 */
export default async function AgentDashboardPage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/agent");
  if (!canViewAgentConsole(user.role)) redirect("/");

  const service = createServiceClient();

  if (!canWriteAgentLeads(user.role)) {
    return <CofounderPipelineView name={user.full_name} />;
  }

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
        <LeadRowList
          leads={recentLeads ?? []}
          emptyLabel="No leads yet — lock your first one"
        />
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

/**
 * Read-only acquisition pipeline for a co-founder.
 *
 * Deliberately not the field-rep console with the buttons removed. A co-founder
 * has no `agents` row, so "my leads", the weekly target and the conversion
 * counter have no value to show — a version of this page with those cards empty
 * would read as a broken console rather than a different one.
 *
 * What it shows instead is the pipeline across every agent, which is the
 * question an executive is actually asking, and it says out loud that the
 * approval and payout actions live in admin. Every figure is a direct count of
 * `leads.status`; nothing here is inferred from free text.
 */
async function CofounderPipelineView({ name }: { name: string | null }) {
  const service = createServiceClient();
  const now = new Date().toISOString();
  const [recent, open, converted] = await Promise.all([
    service
      .from("leads")
      .select("id, shop_name, status, locked_until")
      .order("created_at", { ascending: false })
      .limit(8),
    // "Open" means the lock is still live, which is `locked_until > now` and not
    // `status = 'locked'` — nothing rewrites `status` when a lock lapses, so the
    // status alone would count leads the list below shows as no longer locked.
    // Same condition `capture_lead` uses (`l.locked_until > NOW()`).
    service
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "locked")
      .gt("locked_until", now),
    service
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "converted"),
  ]);

  // A failed query leaves data null and counts null, which would render as an
  // empty pipeline beside two zeroes — a co-founder would read "no leads" when
  // the truth is "we could not ask". Say which it is.
  const failed = recent.error ?? open.error ?? converted.error;
  if (failed) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-mobile border-x border-line bg-white px-4 pb-10 pt-5">
        <h1 className="text-lg font-bold text-ink">Acquisition</h1>
        <div className="mt-5 rounded-card border border-line bg-white px-4 py-6">
          <p className="text-sm font-semibold text-ink">Could not load the pipeline.</p>
          <p className="mt-1 text-xs text-muted">
            This is a read error, not an empty pipeline — the lead counts below would
            be wrong, so they are not shown. Reload the page; if it keeps failing,
            tell the Maanta team.
          </p>
          <Link
            href="/founder"
            className="mt-4 block text-center text-xs font-semibold text-muted underline"
          >
            Founder dashboard
          </Link>
        </div>
      </main>
    );
  }

  const recentLeads = recent.data;
  const openLeads = open.count;
  const convertedLeads = converted.count;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-mobile border-x border-line bg-white px-4 pb-10 pt-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">
          Acquisition · {name ?? "Co-founder"}
        </h1>
        <span className="rounded-full bg-cream px-3 py-1 text-xs font-bold text-ink">
          BBS Mall
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">
        Read-only. Merchant approvals, disputes and payouts are in the admin console.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <KpiCard label="Leads open" value={openLeads ?? 0} />
        <KpiCard label="Leads converted" value={convertedLeads ?? 0} />
      </div>

      <h2 className="mt-6 text-base font-bold text-ink">Recent leads</h2>
      <div className="mt-2 space-y-2.5">
        <LeadRowList leads={recentLeads ?? []} emptyLabel="No leads yet" />
      </div>

      <Link
        href="/founder"
        className="mt-4 block text-center text-xs font-semibold text-muted underline"
      >
        Founder dashboard
      </Link>
    </main>
  );
}
