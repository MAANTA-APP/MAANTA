import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { AdminReadError } from "@/components/admin/read-error";
import { GuardianChip } from "@/components/ui/chips";
import { cn, friendlyTime, relativeAgo } from "@/lib/ui";
import { IconChevronRight } from "@/components/ui/icons";
import {
  countStages,
  reachedColumns,
  visitStage,
  FUNNEL_COLUMNS,
  VISIT_STAGE_META,
  type VisitStage,
} from "@/lib/visit-funnel";
import { VisitStageChip } from "@/components/admin/visit-stage-chip";

export const dynamic = "force-dynamic";

/**
 * Most claims listed in one pass. Stated on the page when it bites; a
 * truncated cohort must never read as the whole window (pilot-bounded-reads).
 */
const MAX_ROWS = 200;
/** The live staff-queue snapshot is bounded too; a page that hits it is reported as incomplete. */
const QUEUE_CAP = 50;

/**
 * Visits & redemptions — the physical funnel, made legible.
 *
 *   CLAIM → ARRIVAL / CHECK-IN → QUEUE → VERIFICATION → REDEMPTION
 *
 * One population: claims made in the selected window, read as they stand
 * now. Each row is placed in exactly one stage by `lib/visit-funnel.ts`, so a
 * claim is never counted as an arrival, an arrival never as a redemption, a
 * queue entry never as a redemption, and a QR scan never as a redemption.
 * Redeemed is the only stage at which money moved.
 *
 * Rows claimed before `20260824130000_redemptions_claimed_at` carry a NULL
 * `claimed_at` and fall outside every window here, deliberately: their claim
 * times were never recorded and are not fabricated.
 *
 * Read-only. Guardian holds, appeals and fee reversals stay on the redemption
 * page; this surface links to them.
 */
export default async function AdminVisitsPage({
  searchParams,
}: {
  searchParams: { window?: string; merchant?: string; stage?: string };
}) {
  await requireAdminPage();

  const days = searchParams.window === "30" ? 30 : searchParams.window === "1" ? 1 : 7;
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const merchantFilter = (searchParams.merchant ?? "").trim() || null;
  const stageFilter = (Object.keys(VISIT_STAGE_META) as VisitStage[]).includes(
    searchParams.stage as VisitStage
  )
    ? (searchParams.stage as VisitStage)
    : null;

  const service = createServiceClient();
  const nowIso = new Date().toISOString();

  let claimsQuery = service
    .from("redemptions")
    .select(
      "id, status, claimed_at, arrived_at, redeemed_at, expires_at, fraud_flags, merchant_id, merchants(merchant_name), deals(title), users(full_name), merchant_presentations(status, expires_at)",
      { count: "exact" }
    )
    .gte("claimed_at", since)
    .order("claimed_at", { ascending: false })
    .limit(MAX_ROWS);
  if (merchantFilter) claimsQuery = claimsQuery.eq("merchant_id", merchantFilter);

  // `count: "exact"` so a snapshot that hit the cap is reported as incomplete
  // instead of presented as the whole queue (Codex P2 on PR #319).
  let queueQuery = service
    .from("merchant_presentations")
    .select("id, arrived_at, expires_at, merchant_id, merchants(merchant_name), redemptions(id, status, expires_at)", {
      count: "exact",
    })
    .eq("status", "waiting")
    .gt("expires_at", nowIso)
    .order("arrived_at", { ascending: true })
    .limit(QUEUE_CAP);
  if (merchantFilter) queueQuery = queueQuery.eq("merchant_id", merchantFilter);

  const [claimsRes, queueRes, heldRes, merchantRes] = await Promise.all([
    claimsQuery,
    queueQuery,
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "flagged"),
    merchantFilter
      ? service.from("merchants").select("id, merchant_name").eq("id", merchantFilter).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (claimsRes.error) {
    return (
      <main className="max-w-5xl">
        <h1 className="text-2xl font-bold text-ink">Visits &amp; redemptions</h1>
        <div className="mt-5">
          <AdminReadError
            what="the claim funnel"
            sub="This is a read error, not an empty funnel. Reload; if it keeps failing, do not conclude nobody claimed."
          />
        </div>
      </main>
    );
  }

  type Row = {
    id: string;
    status: string;
    claimed_at: string | null;
    arrived_at: string | null;
    redeemed_at: string;
    expires_at: string;
    fraud_flags: string[] | null;
    merchant_id: string;
    merchants: { merchant_name: string } | null;
    deals: { title: string } | null;
    users: { full_name: string | null } | null;
    merchant_presentations: { status: string; expires_at: string }[] | null;
  };
  const now = new Date();
  const rows = (claimsRes.data ?? []) as unknown as Row[];
  const total = claimsRes.count;
  const omitted = total === null ? null : Math.max(0, total - rows.length);
  const stages = countStages(rows, now);
  const reached = reachedColumns(rows, now);
  const shown = stageFilter ? rows.filter((r) => visitStage(r, now) === stageFilter) : rows;

  const heldCount = heldRes.error ? null : heldRes.count ?? 0;
  const merchantName =
    (merchantRes.data as { merchant_name?: string } | null)?.merchant_name ?? null;
  const base = (params: Record<string, string | null>) => {
    const q = new URLSearchParams();
    q.set("window", String(days));
    if (merchantFilter) q.set("merchant", merchantFilter);
    for (const [k, v] of Object.entries(params)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return `/admin/visits${s ? `?${s}` : ""}`;
  };

  const queueRows = (queueRes.data ?? []) as unknown as {
    id: string;
    arrived_at: string;
    expires_at: string;
    merchant_id: string;
    merchants: { merchant_name: string } | null;
    redemptions: { id: string; status: string; expires_at: string } | null;
  }[];
  const liveQueue = queueRows.filter(
    (q) => q.redemptions?.status === "pending" && new Date(q.redemptions.expires_at) > now
  );
  // More waiting rows exist than were read: the list below, and especially an
  // empty list after the in-memory redemption filter, is not the queue.
  const queueTruncated = queueRes.count !== null && queueRes.count > queueRows.length;

  return (
    <main className="max-w-5xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Visits &amp; redemptions</h1>
        <p className="text-xs text-muted">
          Claims made in the last {days === 1 ? "24 hours" : `${days} days`}
          {merchantName ? ` · ${merchantName}` : " · all merchants"} · read-only
        </p>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        One population — claims made in the window — read as they stand now. Each
        claim sits in exactly one stage. A claim is not an arrival, an arrival is
        not a redemption, a queue entry is not a redemption, and a QR scan is not a
        redemption. Only <strong className="font-semibold text-ink">Redeemed</strong>{" "}
        moves money.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[1, 7, 30].map((d) => (
          <Link
            key={d}
            href={`/admin/visits?window=${d}${merchantFilter ? `&merchant=${merchantFilter}` : ""}`}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              d === days ? "bg-ink text-white" : "bg-cream-dark text-muted"
            )}
          >
            {d === 1 ? "24h" : `${d}d`}
          </Link>
        ))}
        {merchantFilter ? (
          <Link href={`/admin/visits?window=${days}`} className="text-xs font-semibold text-secondary underline">
            Clear merchant filter
          </Link>
        ) : null}
        <Link
          href="/admin/redemptions"
          className="ml-auto text-sm font-semibold text-secondary hover:text-ink"
        >
          Guardian &amp; fraud review{heldCount === null ? "" : ` · ${heldCount} held`}
        </Link>
      </div>

      {/* ---- The funnel: how far this cohort got ---------------------------- */}
      <h2 className="mt-6 text-sm font-semibold text-ink">
        How far the {rows.length.toLocaleString()} claims got
      </h2>
      <p className="mt-0.5 max-w-3xl text-xs text-muted">
        Cumulative reach. A claim counts under every column it passed through,
        from its own evidence: arrival from the counter QR stamp, queue from a
        queue row, verification from a terminal outcome, redemption from
        success. A code typed at the keypad with no QR scan is a redemption
        with no arrival, and that is a true statement about the visit.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FUNNEL_COLUMNS.map((c, i) => (
          <div
            key={c.id}
            className={cn(
              "rounded-card bg-white p-4 shadow-card",
              c.id === "redemption" && "border border-ink"
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {i + 1}. {c.label}
            </p>
            <p className="tnum mt-1 text-2xl font-bold text-ink">{reached[c.id].toLocaleString()}</p>
            {c.id === "redemption" ? (
              <p className="mt-1 text-[11px] leading-snug text-faint">
                The only column where the success fee is charged.
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {/* ---- Where each claim is now ---------------------------------------- */}
      <h2 className="mt-6 text-sm font-semibold text-ink">Where each claim is now</h2>
      <p className="mt-0.5 max-w-3xl text-xs text-muted">
        Every claim in exactly one state. Tap a state to filter the list.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {(Object.keys(VISIT_STAGE_META) as VisitStage[]).map((s) => {
          const m = VISIT_STAGE_META[s];
          const active = stageFilter === s;
          return (
            <Link
              key={s}
              href={base({ stage: active ? null : s })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-card border bg-white p-3 shadow-card hover:bg-stone-soft",
                active ? "border-ink" : "border-line"
              )}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <span aria-hidden>{m.icon}</span>
                {m.label}
              </p>
              <p className="tnum mt-1 text-xl font-bold text-ink">{stages[s].toLocaleString()}</p>
              <p className="mt-1 text-[11px] leading-snug text-faint">{m.hint}</p>
            </Link>
          );
        })}
      </div>

      {/* ---- Live queue right now ------------------------------------------ */}
      <h2 className="mt-6 text-sm font-semibold text-ink">On a staff queue right now</h2>
      <p className="mt-0.5 max-w-3xl text-xs text-muted">
        A snapshot as this page loaded, not a figure for the window. Entries lapse
        after about ten minutes and never touch the claim.
      </p>
      {queueRes.error ? (
        <div className="mt-2">
          <AdminReadError what="the live staff queues" sub="Unknown, not empty." />
        </div>
      ) : queueTruncated ? (
        <div className="mt-2">
          <AdminReadError
            what="the live staff queues"
            sub={`Incomplete, not empty: ${queueRes.count} waiting rows exceed the ${QUEUE_CAP} this page reads in one pass, so the queue cannot be shown as a whole. Narrow to one merchant, or reload once the queue drains.`}
          />
        </div>
      ) : liveQueue.length === 0 ? (
        <p className="mt-2 rounded-card bg-white px-4 py-4 text-sm text-muted shadow-card">
          Nobody is waiting on a staff queue right now.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {liveQueue.map((q) => (
            <Link
              key={q.id}
              href={`/admin/redemptions/${q.redemptions?.id}`}
              className="flex items-center gap-3 rounded-card bg-white px-4 py-3 shadow-card hover:bg-stone-soft"
            >
              <VisitStageChip stage="in_queue" />
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                {q.merchants?.merchant_name ?? "Unknown shop"}
              </span>
              <span className="text-xs text-muted">arrived {relativeAgo(q.arrived_at, now)}</span>
              <IconChevronRight className="h-4 w-4 text-faint" aria-hidden />
            </Link>
          ))}
        </div>
      )}

      {/* ---- The claims themselves ----------------------------------------- */}
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          Claims{stageFilter ? ` · ${VISIT_STAGE_META[stageFilter].label}` : ""}
        </h2>
        <span className="text-xs text-muted">{shown.length.toLocaleString()} shown</span>
      </div>
      {omitted === null && rows.length >= MAX_ROWS ? (
        <p className="mt-2 rounded-card bg-white px-4 py-3 text-xs text-muted shadow-card">
          Showing the {MAX_ROWS} most recent claims. The window total could not be
          established, so it is unknown whether more exist — the funnel above
          covers only the claims shown.
        </p>
      ) : null}
      {omitted !== null && omitted > 0 ? (
        <p className="mt-2 rounded-card bg-white px-4 py-3 text-xs text-muted shadow-card">
          Showing the {MAX_ROWS} most recent of {total} claims in the window. {omitted} older{" "}
          {omitted === 1 ? "claim is" : "claims are"} not listed, and the funnel above
          covers only the claims shown. Narrow the window to see all of it.
        </p>
      ) : null}
      {shown.length === 0 ? (
        <p className="mt-2 rounded-card bg-white px-4 py-6 text-center text-sm text-muted shadow-card">
          {rows.length === 0
            ? `No claims with a recorded claim time in the last ${days === 1 ? "24 hours" : `${days} days`}.`
            : "No claims in this state."}
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-card bg-white shadow-card">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-semibold">State</th>
                <th className="px-3 py-2 font-semibold">Claimed</th>
                <th className="px-3 py-2 font-semibold">Merchant · deal</th>
                <th className="px-3 py-2 font-semibold">Shopper</th>
                <th className="px-3 py-2 font-semibold">Arrived</th>
                <th className="px-3 py-2 font-semibold">Outcome</th>
                <th className="px-3 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const stage = visitStage(r, now);
                const flags = (r.fraud_flags ?? []) as string[];
                return (
                  <tr key={r.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="px-3 py-2">
                      <VisitStageChip stage={stage} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {r.claimed_at ? friendlyTime(r.claimed_at, now) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/merchants/${r.merchant_id}#activity`}
                        className="font-semibold text-ink underline-offset-2 hover:underline"
                      >
                        {r.merchants?.merchant_name ?? "Unknown shop"}
                      </Link>
                      <span className="block text-[11px] text-muted">{r.deals?.title ?? "Deal removed"}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-ink">{r.users?.full_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {r.arrived_at ? friendlyTime(r.arrived_at, now) : "no check-in"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {stage === "redeemed"
                        ? `verified ${friendlyTime(r.redeemed_at, now)}`
                        : stage === "held" || stage === "rejected"
                          ? (
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              {flags.includes("guardian_hard_block") ? <GuardianChip recommendation="hard_block" /> : null}
                              {stage === "held" ? <GuardianChip recommendation="soft_block" /> : null}
                              {friendlyTime(r.redeemed_at, now)}
                            </span>
                          )
                          : stage === "expired"
                            ? `expired ${friendlyTime(r.expires_at, now)}`
                            : `expires ${friendlyTime(r.expires_at, now)}`}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/redemptions/${r.id}`}
                        className="text-xs font-semibold text-secondary hover:text-ink"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-muted">
        Windowed by <code>claimed_at</code>; claims recorded before claim-time tracking
        began carry no claim time and are not shown. State is derived from the row&apos;s
        status, its ticket expiry, its counter-QR arrival stamp and any live queue
        entry, in that order. No rate is shown: at Node 0 volumes a percentage would
        describe noise, and the claim → walk-in tripwire is read on the founder command
        centre against the external cohort only.
      </p>
    </main>
  );
}
