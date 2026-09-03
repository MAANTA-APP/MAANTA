import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { SearchField } from "@/components/ui/inputs";
import { FraudChip } from "@/components/ui/chips";
import { cn, friendlyTime } from "@/lib/ui";
import { ModerationActions } from "./moderation-actions";
import { AdminReadError } from "@/components/admin/read-error";
import { claimAllocation, claimAllocationLine } from "@/lib/claim-allocation";
import {
  adminDealState,
  matchesDealStateFilter,
  isAdminDealStateFilter,
  ADMIN_DEAL_STATE_FILTERS,
  ADMIN_DEAL_STATE_META,
  type AdminDealStateFilter,
} from "@/lib/admin-deal-state";
import { DealStateChip } from "@/components/admin/deal-state-chip";

export const dynamic = "force-dynamic";

/** Bounded read; the page says so when it bites rather than truncating silently. */
const MAX_DEALS = 200;

/**
 * Deals directory — every deal, its operational state, and its claim
 * allocation in the D236 vocabulary.
 *
 * Until 2026-09-03 this route listed only deals whose merchant had an
 * unresolved fraud event, so an admin asked "is Merchant 01's deal live?"
 * had nowhere to look but the merchant's own app. The moderation queue is
 * kept, at the top, exactly as it was: a fraud signal is the only organic
 * flag source the database has, and "Remove deal" is still the one deal
 * mutation the console owns. Pausing and allocation belong to the merchant
 * (`PATCH /api/deals/[id]`); the console renders them and does not fake
 * controls it cannot enforce.
 *
 * State is derived by `lib/admin-deal-state.ts`: ended → paused → expired /
 * in grace → fully claimed → live, in that order. Allocation is
 * `lib/claim-allocation.ts`: `max_claims` is the number of shopper claims
 * that may be issued, never a redemption limit.
 */
export default async function AdminDealsPage({
  searchParams,
}: {
  searchParams: { q?: string; state?: string; demo?: string };
}) {
  await requireAdminPage();

  const q = (searchParams.q ?? "").trim();
  const filter: AdminDealStateFilter = isAdminDealStateFilter(searchParams.state)
    ? searchParams.state
    : "all";
  const includeDemo = searchParams.demo === "1";

  const service = createServiceClient();
  const [eventsRes, dealsRes] = await Promise.all([
    service.from("fraud_events").select("merchant_id").eq("resolved", false).limit(MAX_DEALS),
    (() => {
      let query = service
        .from("deals")
        .select(
          "id, title, deal_type, is_active, is_paused, is_demo, boost_active, max_claims, claims_count, expires_at, created_at, node, merchant_id, merchants(merchant_name, status, is_demo)",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .limit(MAX_DEALS);
      if (!includeDemo) query = query.eq("is_demo", false);
      if (q) query = query.ilike("title", `%${q}%`);
      return query;
    })(),
  ]);

  if (eventsRes.error) {
    return (
      <main className="max-w-5xl">
        <h1 className="text-2xl font-bold text-ink">Deals</h1>
        <div className="mt-5"><AdminReadError what="fraud signals" /></div>
      </main>
    );
  }
  if (dealsRes.error) {
    return (
      <main className="max-w-5xl">
        <h1 className="text-2xl font-bold text-ink">Deals</h1>
        <div className="mt-5"><AdminReadError what="the deals directory" /></div>
      </main>
    );
  }

  const flaggedMerchants = new Set(
    (eventsRes.data ?? []).map((e) => e.merchant_id).filter(Boolean) as string[]
  );

  type Row = {
    id: string;
    title: string;
    deal_type: string;
    is_active: boolean;
    is_paused: boolean;
    is_demo: boolean;
    boost_active: boolean;
    max_claims: number | null;
    claims_count: number;
    expires_at: string | null;
    created_at: string;
    node: string;
    merchant_id: string;
    merchants: { merchant_name: string; status: string; is_demo: boolean } | null;
  };
  const now = new Date();
  const all = (dealsRes.data ?? []) as unknown as Row[];
  const total = dealsRes.count;
  const omitted = total === null ? null : Math.max(0, total - all.length);

  const withState = all.map((d) => ({ d, state: adminDealState(d, now) }));
  const counts = Object.fromEntries(
    ADMIN_DEAL_STATE_FILTERS.map((f) => [f, withState.filter((x) => matchesDealStateFilter(x.state, f)).length])
  ) as Record<AdminDealStateFilter, number>;
  const shown = withState.filter((x) => matchesDealStateFilter(x.state, filter));
  const flagged = withState.filter((x) => x.d.is_active && flaggedMerchants.has(x.d.merchant_id));

  const href = (over: { state?: AdminDealStateFilter; demo?: boolean }) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    const s = over.state ?? filter;
    if (s !== "all") p.set("state", s);
    if (over.demo ?? includeDemo) p.set("demo", "1");
    const str = p.toString();
    return `/admin/deals${str ? `?${str}` : ""}`;
  };

  return (
    <main className="max-w-5xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Deals</h1>
        <p className="text-xs text-muted">
          {includeDemo ? "Including synthetic deals" : "Genuine deals only"} · state read now
        </p>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Every deal and where it stands. Claim allocation is the number of shopper
        claims that may be issued (D236) — never a redemption limit. Pausing and
        allocation are the merchant&apos;s controls; the console shows them and can
        remove a deal.
      </p>

      {/* Moderation queue — unchanged in substance, first because it is the
          only part of this page that carries an action. */}
      {flagged.length > 0 ? (
        <section className="mt-5 rounded-card border border-flame/50 bg-white p-4 shadow-card">
          <h2 className="text-sm font-bold text-ink">
            Flagged for review ({flagged.length})
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Active deals whose merchant has an unresolved fraud signal. Resolve the
            signal on{" "}
            <Link href="/admin/redemptions" className="underline">
              Guardian &amp; fraud review
            </Link>
            , or remove the deal.
          </p>
          <div className="mt-3 space-y-2">
            {flagged.map(({ d }) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-card bg-stone px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">
                    &ldquo;{d.title}&rdquo; — {d.merchants?.merchant_name}
                  </p>
                </div>
                <FraudChip reason="Fraud signals" />
                <ModerationActions dealId={d.id} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form action="/admin/deals" className="w-full max-w-md">
          {filter !== "all" ? <input type="hidden" name="state" value={filter} /> : null}
          {includeDemo ? <input type="hidden" name="demo" value="1" /> : null}
          <SearchField name="q" defaultValue={q} placeholder="Search deals…" />
        </form>
        <Link
          href={href({ demo: !includeDemo })}
          className="text-xs font-semibold text-secondary underline"
        >
          {includeDemo ? "Hide synthetic deals" : "Show synthetic deals"}
        </Link>
      </div>

      <nav aria-label="Filter by state" className="mt-4 flex flex-wrap gap-2">
        {ADMIN_DEAL_STATE_FILTERS.map((f) => (
          <Link
            key={f}
            href={href({ state: f })}
            aria-current={filter === f ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold",
              filter === f ? "bg-ink text-white" : "bg-cream text-muted hover:text-ink"
            )}
          >
            {f === "all" ? "All" : ADMIN_DEAL_STATE_META[f === "expired" ? "expired" : f].label} · {counts[f]}
          </Link>
        ))}
      </nav>

      {omitted !== null && omitted > 0 ? (
        <p className="mt-3 rounded-card bg-white px-4 py-3 text-xs text-muted shadow-card">
          Showing the {MAX_DEALS} newest of {total} matching deals. {omitted} older{" "}
          {omitted === 1 ? "deal is" : "deals are"} not listed; the state counts above cover
          only the deals shown. Search to narrow.
        </p>
      ) : null}
      {omitted === null && all.length >= MAX_DEALS ? (
        <p className="mt-3 rounded-card bg-white px-4 py-3 text-xs text-muted shadow-card">
          Showing the {MAX_DEALS} newest deals; the total could not be established.
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {shown.length === 0 ? (
          <p className="rounded-card bg-white px-4 py-8 text-center text-sm text-muted shadow-card">
            {all.length === 0 ? "No deals match" : "No deals in this state"}
          </p>
        ) : (
          shown.map(({ d, state }) => {
            const alloc = claimAllocation({ maxClaims: d.max_claims, claimsCount: d.claims_count });
            return (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-card bg-white px-4 py-3.5 shadow-card"
              >
                <DealStateChip state={state} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">
                    {d.title}
                    {d.is_demo ? (
                      <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        synthetic
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    <Link
                      href={`/admin/merchants/${d.merchant_id}#deals`}
                      className="font-semibold text-ink underline-offset-2 hover:underline"
                    >
                      {d.merchants?.merchant_name ?? "Unknown shop"}
                    </Link>
                    {d.merchants && d.merchants.status !== "active" ? ` (${d.merchants.status})` : ""}
                    {" · "}
                    {d.node}
                    {" · "}
                    {d.deal_type === "flash" ? "Flash" : "Standard"}
                    {d.boost_active ? " · Boosted" : ""}
                  </p>
                  <p className="tnum mt-0.5 text-xs text-ink">{claimAllocationLine(alloc)}</p>
                </div>
                <span className="text-xs text-muted">
                  {d.expires_at
                    ? `${state === "expired" || state === "in_grace" ? "expired" : "expires"} ${friendlyTime(d.expires_at, now)}`
                    : "no expiry"}
                </span>
              </div>
            );
          })
        )}
      </div>

      <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-muted">
        Fully claimed deals stay discoverable — the founder doctrine of 2026-08-28 is
        that discoverable is not claimable — so they are listed as a state, not hidden.
        Lowering an allocation below the issued count stops new claims and touches no
        existing ticket. There is no console control to pause, resume or re-allocate a
        deal, because the backend enforces those only for the merchant.
      </p>
    </main>
  );
}
