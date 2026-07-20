import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/data";
import { formatCode } from "@/lib/ui";
import { dealPricing } from "@/lib/pricing";
import { W3wChip, ClaimChip } from "@/components/ui/chips";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowLeft, IconCheck } from "@/components/ui/icons";
import { TicketWatcher } from "./ticket-watcher";
import { ClaimedCode } from "./claimed-code";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  otp_code: string;
  status: "pending" | "success" | "failed" | "flagged";
  fraud_flags: string[] | null;
  expires_at: string;
  redeemed_at: string | null;
  amount_kes: number | null;
  deals: {
    id: string;
    title: string;
    expires_at: string | null;
    price_kes: number | null;
    compare_at_kes: number | null;
    charges: unknown;
  } | null;
  merchants: {
    id: string;
    merchant_name: string;
    floor: string | null;
    what3words_address: string;
  } | null;
};

/** HH:MM in 24h local, e.g. "18:15". */
function hhmm(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

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
      "id, otp_code, status, fraud_flags, expires_at, redeemed_at, amount_kes, user_id, deals(id, title, expires_at, price_kes, compare_at_kes, charges), merchants(id, merchant_name, floor, what3words_address)"
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
  const w3wHref = `https://what3words.com/${m.what3words_address.replace(/^\/+/, "")}`;

  // YOU PAY: prefer the amount snapshotted at claim; fall back to the live deal
  // price. Same computation as the tile and deal detail (lib/pricing).
  const priced = ticket.deals
    ? dealPricing(ticket.deals)
    : { pay: null, was: null, extras: 0, charges: [] };
  const pay = ticket.amount_kes ?? priced.pay;

  // Redemption success — neutral, not celebratory. Money moved; carries a code reference.
  if (ticket.status === "success") {
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
            Redeemed today {hhmm(ticket.redeemed_at)}
          </p>
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
        <div className="mt-6 flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5">
          <span className="font-code text-lg text-ink">{formatCode(ticket.otp_code)}</span>
          <ClaimChip state="limit" label="UNDER REVIEW" />
        </div>
        <div className="mt-4 flex gap-2.5 rounded-card border-[1.5px] border-l-[5px] border-rust bg-white p-4 text-sm text-ink">
          <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border-[1.5px] border-rust text-[10px] text-rust">
            !
          </span>
          <p className="leading-relaxed">
            <span className="font-bold">This redemption is under review</span>
            {ticket.fraud_flags?.includes("geofence") ? " (location mismatch)" : ""}.
            Support will resolve it within 24 hours. Nothing is needed from you right now.
          </p>
        </div>
        <ButtonLink href="/help" variant="ghost" full className="mt-6">
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
          The deal ended and the 15-minute grace period has passed. Expired codes
          cannot be redeemed.
        </p>
        <ButtonLink href="/feed" full className="mt-8">
          See live deals
        </ButtonLink>
      </main>
    );
  }

  // Pending, live code — the hero (S5). Zero amber actions: the screen IS the credential.
  return (
    <main className="flex flex-col items-center px-5 pb-10 pt-4">
      <TicketWatcher active />
      <div className="flex w-full items-center">
        <Link href="/my-deals" aria-label="Back" className="-ml-1 p-1 text-ink">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
      </div>

      {justClaimed ? (
        <div className="mt-2 w-full rounded-xl border border-line bg-white py-2.5 text-center text-sm font-bold text-ink">
          Deal claimed
        </div>
      ) : null}

      <div className="mt-4">
        <ClaimChip state="claimed" />
      </div>

      <div className="mt-4 w-full">
        <ClaimedCode code={ticket.otp_code} expiresAt={ticket.expires_at} />
      </div>

      <div className="mt-4 w-full">
        <h1 className="text-xl font-bold leading-tight text-ink">{m.merchant_name}</h1>
        {m.floor ? (
          <p className="text-sm font-semibold text-secondary">{m.floor}</p>
        ) : null}
        {ticket.deals?.title ? (
          <p className="mt-1.5 text-sm text-ink">{ticket.deals.title}</p>
        ) : null}
        <p className="tnum mt-0.5 text-sm text-secondary">
          {ticket.deals?.expires_at ? `Deal ends ${hhmm(ticket.deals.expires_at)} · ` : ""}
          code valid until {hhmm(ticket.expires_at)} today
        </p>
      </div>

      {pay != null ? (
        <div className="mt-4 w-full border-t border-line pt-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            You pay
          </div>
          <div className="tnum text-2xl font-bold text-ink">
            KES {pay.toLocaleString("en-KE")}
          </div>
          {priced.extras > 0 ? (
            <div className="tnum mt-0.5 text-sm text-secondary">
              Includes KES {priced.extras.toLocaleString("en-KE")} in taxes and charges
            </div>
          ) : null}
          {priced.was != null ? (
            <div className="tnum text-sm text-secondary line-through">
              Was KES {priced.was.toLocaleString("en-KE")}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 w-full">
        <W3wChip address={m.what3words_address} />
      </div>

      <ButtonLink
        href={w3wHref}
        variant="ghost"
        full
        className="mt-6"
        target="_blank"
        rel="noopener noreferrer"
      >
        Navigate
      </ButtonLink>

      <p className="mt-6 text-center text-sm font-semibold text-ink">
        Show this screen at the counter.
      </p>
      <p className="mt-1 text-center text-xs text-muted">
        If the timer isn&apos;t moving, it&apos;s a screenshot.
      </p>
    </main>
  );
}
