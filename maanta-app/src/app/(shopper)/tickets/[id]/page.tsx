import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/data";
import { formatCode } from "@/lib/ui";
import { dealPricing, extrasLine } from "@/lib/pricing";
import { W3wChip, ClaimChip } from "@/components/ui/chips";
import { ButtonLink } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { IconCheck } from "@/components/ui/icons";
import { BackIconButton } from "@/components/ui/claude";
import { TicketWatcher } from "./ticket-watcher";
import { ClaimedCode } from "./claimed-code";
import { FastVisitPanel } from "./fast-visit-panel";
import { DEAL_GRACE_MINUTES } from "@/lib/deal-expiry";
import { absoluteTimeLabel } from "@/lib/claim-ticket-time";
import { shopNavigationTarget } from "@/lib/shop-location";
import { isFastVisitEnabled } from "@/lib/fast-visit";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  otp_code: string;
  status: "pending" | "success" | "failed" | "flagged";
  fraud_flags: string[] | null;
  expires_at: string;
  redeemed_at: string | null;
  /** DB-stamped at claim (D164); NULL on historical rows, never fabricated. */
  claimed_at: string | null;
  /** Server-stamped by record_shopper_arrival; NULL = no MAANTA check-in. */
  arrived_at: string | null;
  /** The immutable arrival-time Fast Visit verdict; NULL = did not qualify. */
  fast_visit_qualified_at: string | null;
  amount_kes: number | null;
  deals: {
    id: string;
    title: string;
    expires_at: string | null;
    price_kes: number | null;
    compare_at_kes: number | null;
    charges: unknown;
    is_paused: boolean | null;
  } | null;
  merchants: {
    id: string;
    merchant_name: string;
    floor: string | null;
    /** Nullable since D162 — a coordinate-only shop is a normal shop. */
    what3words_address: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
};

// Wall-clock strings render via `absoluteTimeLabel` (lib/claim-ticket-time):
// Nairobi time with an honest day word. The private HH:MM helper this page
// carried formatted in the SERVER's timezone — UTC on Vercel, three hours
// behind the shopper — and its call sites hardcoded "today", which was false
// for any code window crossing midnight (D190).

/** S5 claimed code (hero) + verified / expired / flagged states. */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { claimed?: string };
}) {
  const user = await getAppUser();
  if (!user) redirect(`/login?next=/tickets/${params.id}`);

  const service = createServiceClient();
  const { data } = await service
    .from("redemptions")
    .select(
      "id, otp_code, status, fraud_flags, expires_at, redeemed_at, claimed_at, arrived_at, fast_visit_qualified_at, amount_kes, user_id, deals(id, title, expires_at, price_kes, compare_at_kes, charges, is_paused), merchants(id, merchant_name, floor, what3words_address, lat, lng)"
    )
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const ticket = data as unknown as (Row & { user_id: string }) | null;
  if (!ticket || !ticket.merchants) notFound();

  const m = ticket.merchants;
  const expired =
    ticket.status === "failed" ||
    (ticket.status === "pending" && new Date(ticket.expires_at) <= new Date());
  const justClaimed = searchParams.claimed === "1";
  // D162 — the shop may be coordinate-only, in which case Navigate opens the
  // in-app map instead of what3words, and the chip is simply absent.
  const navigate = shopNavigationTarget(m);

  // YOU PAY: prefer the amount snapshotted at claim; fall back to the live deal
  // price. Same computation as the tile and deal detail (lib/pricing).
  const priced = ticket.deals
    ? dealPricing(ticket.deals)
    : { pay: null, was: null, extras: 0, charges: [] };
  const pay = ticket.amount_kes ?? priced.pay;

  // Redemption success — neutral, not celebratory. Money moved; carries a code reference.
  if (ticket.status === "success") {
    // Fast Visit self-heal + read. The award normally happens in the verify
    // route the moment staff confirm; calling the idempotent RPC again here
    // closes the crash window between verify and award (a real UNIQUE
    // reference makes a double call a no-op, never a double award). Display
    // reads the ledger row, so an earned reward stays visible even if the
    // feature gate is later turned off. Best-effort throughout — a reward
    // read failure must never take down the success screen.
    let rewardPoints: number | null = null;
    let rewardBalance: number | null = null;
    try {
      // PostgREST failures RESOLVE as `{ error }` rather than throwing, so the
      // catch below never sees them — log here or a backstop that has quietly
      // stopped backstopping is indistinguishable from "this shopper did not
      // qualify". Same trap the verify route documents. D200.
      const { error: awardError } = await service.rpc("award_fast_visit_points", {
        p_redemption_id: ticket.id,
      });
      if (awardError) {
        console.error("award_fast_visit_points (ticket self-heal) failed:", awardError.code);
      }
      const { data: rewardRow, error: rewardError } = await service
        .from("reward_events")
        .select("points")
        .eq("redemption_id", ticket.id)
        .maybeSingle<{ points: number }>();
      if (rewardError) {
        console.error("reward_events read failed:", rewardError.code);
      }
      if (rewardRow) {
        rewardPoints = rewardRow.points;
        const { data: all } = await service
          .from("reward_events")
          .select("points")
          .eq("user_id", ticket.user_id);
        rewardBalance = all
          ? all.reduce((sum, row) => sum + (row.points ?? 0), 0)
          : null;
      }
    } catch {
      // Points are promotional; the verified redemption is the fact that matters.
    }
    return (
      <main className="flex min-h-[80dvh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] border-ink bg-white">
          <IconCheck className="h-8 w-8 text-ink" />
        </span>
        <div className="mt-5">
          <ClaimChip state="redeemed" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-ink">Code verified</h1>
        <p className="mt-2 text-sm text-secondary">
          {ticket.deals?.title} · {m.merchant_name}
          {m.floor ? `, ${m.floor}` : ""}
        </p>
        {ticket.redeemed_at ? (
          <p className="tnum mt-1 text-sm text-secondary">
            Redeemed {absoluteTimeLabel(ticket.redeemed_at)}
          </p>
        ) : null}
        {rewardPoints != null ? (
          <div className="mt-4 rounded-card bg-white px-4 py-3 shadow-card">
            <p className="text-sm font-semibold text-ink">
              Fast Visit reward earned
            </p>
            <p className="tnum mt-0.5 text-sm text-secondary">
              +{rewardPoints} MAANTA Points
              {rewardBalance != null ? ` · Balance: ${rewardBalance}` : ""}
            </p>
          </div>
        ) : null}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-cream px-3 py-2.5">
          <span className="font-code text-xs tracking-[0.06em] text-secondary">
            {formatCode(ticket.otp_code)}
          </span>
        </div>
        <ButtonLink href="/feed" full className="mt-8">
          Done
        </ButtonLink>
      </main>
    );
  }

  // Redemption — flagged / under review. Rust warning, icon + word (L12).
  if (ticket.status === "flagged") {
    return (
      <main className="px-5 pt-8">
        <h1 className="text-center text-lg font-bold text-ink">Redemption</h1>
        <div className="mt-6 flex items-center justify-between rounded-card bg-white shadow-card px-4 py-3.5">
          <span className="font-code text-lg text-ink">{formatCode(ticket.otp_code)}</span>
          <ClaimChip state="limit" label="UNDER REVIEW" />
        </div>
        <InlineAlert variant="warning" className="mt-4">
          <span className="font-bold">This redemption is under review</span>
          {ticket.fraud_flags?.includes("geofence") ? " (location mismatch)" : ""}.
          Support will resolve it within 72 hours. Nothing is needed from you right
          now.
        </InlineAlert>
        <ButtonLink href="/you/help" variant="ghost" full className="mt-6">
          Contact support
        </ButtonLink>
      </main>
    );
  }

  // Redemption expired.
  if (expired) {
    return (
      <main className="flex min-h-[80dvh] flex-col px-5 pt-6">
        <div className="flex justify-center">
          <ClaimChip state="expired" />
        </div>
        <div className="mt-5 rounded-2xl border-2 border-line bg-cream px-6 py-8 text-center">
          <p className="font-code text-3xl text-faint line-through">
            {formatCode(ticket.otp_code)}
          </p>
        </div>
        <h1 className="mt-6 text-center text-lg font-bold text-ink">
          This code has expired
        </h1>
        <p className="mt-2 text-center text-sm text-secondary">
          The deal ended and the {DEAL_GRACE_MINUTES}-minute grace period has passed.
          Expired codes cannot be redeemed.
        </p>
        <ButtonLink href="/feed" full className="mt-8">
          See live deals
        </ButtonLink>
      </main>
    );
  }

  // Pending, live code — the hero (S5). Zero amber actions: the screen IS the credential.
  // The Fast Visit reward window renders only while the feature gate is on
  // (app_config.fast_visit_enabled — dark until merchant counter QRs exist at
  // Node 0), and always BELOW the code: the reward is secondary to the credential.
  // The panel renders while the gate is ON **or** whenever this arrival
  // already qualified. Gating on the CURRENT flag alone erased an
  // already-earned confirmation the moment the founder flipped the lever —
  // while `award_fast_visit_points` still pays, because it deliberately
  // never re-reads the gate. The migration states the invariant ("earned
  // eligibility is never erased") and /you/page.tsx already honours it; this
  // screen did not. D198.
  const fastVisitOn = await isFastVisitEnabled();
  return (
    <main className="flex flex-col items-center px-5 pb-10 pt-4">
      <TicketWatcher active />
      <div className="flex w-full items-center">
        <BackIconButton fallback="/my-deals" className="bg-transparent p-1 shadow-none" />
      </div>

      {justClaimed ? (
        <div className="mt-2 w-full animate-fade-in rounded-xl border border-line bg-white py-2.5 text-center text-sm font-bold text-ink">
          Deal claimed
        </div>
      ) : null}

      {ticket.deals?.is_paused === true ? (
        <p className="mt-3 w-full rounded-card border border-line bg-cream px-3 py-2.5 text-center text-xs text-muted">
          Your ticket is still valid until {absoluteTimeLabel(ticket.expires_at)}.
          The merchant paused new claims — show this code at the till as usual.
        </p>
      ) : null}

      <div className="mt-4">
        <ClaimChip state="claimed" />
      </div>

      <div className="mt-4 w-full">
        <ClaimedCode code={ticket.otp_code} expiresAt={ticket.expires_at} />
      </div>

      {fastVisitOn || ticket.fast_visit_qualified_at ? (
        <div className="mt-3 w-full">
          <FastVisitPanel
            claimedAt={ticket.claimed_at}
            arrivedAt={ticket.arrived_at}
            qualifiedAt={ticket.fast_visit_qualified_at}
          />
        </div>
      ) : null}

      <div className="mt-4 w-full">
        <h1 className="text-xl font-bold leading-tight text-ink">{m.merchant_name}</h1>
        {m.floor ? (
          <p className="text-sm font-semibold text-secondary">{m.floor}</p>
        ) : null}
        {ticket.deals?.title ? (
          <p className="mt-1.5 text-sm text-ink">{ticket.deals.title}</p>
        ) : null}
        <p className="tnum mt-0.5 text-sm text-secondary">
          {ticket.deals?.expires_at
            ? `Deal ends ${absoluteTimeLabel(ticket.deals.expires_at)} · `
            : ""}
          code valid until {absoluteTimeLabel(ticket.expires_at)}
        </p>
      </div>

      {pay != null ? (
        <div className="mt-4 w-full border-t border-line pt-4">
          {/* Direction A: the price is anchored — label left, figure right on
              one baseline — matching the decision bar on deal detail. The
              figure itself is unchanged (frozen rule 7: identical on tile,
              detail and claimed code), and it stays outside the code card. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              You pay
            </span>
            <span className="tnum whitespace-nowrap text-2xl font-bold text-ink">
              KES {pay.toLocaleString("en-KE")}
            </span>
          </div>
          {priced.extras > 0 || priced.was != null ? (
            <div className="mt-1 text-right">
              {priced.extras > 0 ? (
                <div className="tnum text-sm text-secondary">{extrasLine(priced.extras)}</div>
              ) : null}
              {priced.was != null ? (
                <div className="tnum text-sm text-secondary line-through">
                  Was KES {priced.was.toLocaleString("en-KE")}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {m.what3words_address ? (
        <div className="mt-4 w-full">
          <W3wChip address={m.what3words_address} />
        </div>
      ) : null}

      {navigate ? (
        <ButtonLink
          href={navigate.href}
          variant="ghost"
          full
          className="mt-6"
          {...(navigate.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          Navigate
        </ButtonLink>
      ) : null}

      <p className="mt-6 text-center text-sm font-semibold text-ink">
        Show this screen at the counter.
      </p>
      <p className="mt-1 text-center text-xs text-muted">
        If the timer isn&apos;t moving, it&apos;s a screenshot.
      </p>
    </main>
  );
}
