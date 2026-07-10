import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/data";
import { formatCode } from "@/lib/ui";
import { CodeDisplay } from "@/components/ui/overlays";
import { W3wChip, CountdownChip, StatusChip } from "@/components/ui/chips";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowLeft, IconCheck } from "@/components/ui/icons";
import { TicketWatcher } from "./ticket-watcher";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  otp_code: string;
  status: "pending" | "success" | "failed" | "flagged";
  fraud_flags: string[] | null;
  expires_at: string;
  deals: { id: string; title: string; expires_at: string | null } | null;
  merchants: {
    id: string;
    merchant_name: string;
    floor: string | null;
    what3words_address: string;
  } | null;
};

/** 8i/8j claimed ticket + full code, 8k expired, 8z verified, 8aa flagged. */
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
      "id, otp_code, status, fraud_flags, expires_at, user_id, deals(id, title, expires_at), merchants(id, merchant_name, floor, what3words_address)"
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

  // 8z Redemption success
  if (ticket.status === "success") {
    return (
      <main className="flex min-h-[80dvh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand">
          <IconCheck className="h-8 w-8 text-ink" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">Code verified</h1>
        <p className="mt-2 text-sm text-muted">
          {ticket.deals?.title} · {m.merchant_name}
          {m.floor ? `, ${m.floor}` : ""}
        </p>
        <p className="mt-1 text-sm text-muted">Your discount is applied at the counter.</p>
        <ButtonLink href="/feed" full className="mt-8">
          Done
        </ButtonLink>
      </main>
    );
  }

  // 8aa Redemption — flagged / under review
  if (ticket.status === "flagged") {
    return (
      <main className="px-5 pt-8">
        <h1 className="text-center text-lg font-bold text-ink">Redemption</h1>
        <div className="mt-6 flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5">
          <span className="font-mono text-lg font-bold">{formatCode(ticket.otp_code)}</span>
          <StatusChip status="flagged" />
        </div>
        <div className="mt-4 rounded-card bg-cream p-4 text-sm text-ink">
          This redemption was flagged by our checks
          {ticket.fraud_flags?.includes("geofence") ? " (location mismatch)" : ""}.
          Support will review and resolve it within 24 hours. Nothing is needed from
          you right now.
        </div>
        <ButtonLink href="/help" variant="ghost" full className="mt-6">
          Contact support
        </ButtonLink>
      </main>
    );
  }

  // 8k Redemption expired
  if (expired) {
    return (
      <main className="flex min-h-[80dvh] flex-col px-5 pt-6">
        <div className="rounded-2xl bg-cream px-6 py-8 text-center">
          <p className="font-mono text-4xl font-bold tracking-[0.12em] text-faint line-through">
            {formatCode(ticket.otp_code)}
          </p>
        </div>
        <h1 className="mt-6 text-center text-lg font-bold text-ink">
          This code has expired
        </h1>
        <p className="mt-2 text-center text-sm text-muted">
          The deal ended and the 15-minute grace period has passed.
        </p>
        <ButtonLink href="/feed" full className="mt-8">
          See live deals
        </ButtonLink>
      </main>
    );
  }

  // 8i / 8j — pending, live code
  return (
    <main className="px-5 pb-10 pt-4">
      <TicketWatcher active />
      <div className="flex items-center justify-between">
        <Link href="/my-deals" aria-label="Back" className="p-1 text-ink">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
      </div>

      {justClaimed ? (
        <div className="mt-3 rounded-full bg-ink py-2.5 text-center text-sm font-bold text-brand">
          ✓ Deal claimed
        </div>
      ) : null}

      <p className="mt-6 text-center text-sm font-medium text-muted">
        {m.merchant_name}
        {m.floor ? ` · ${m.floor}` : ""}
      </p>

      <CodeDisplay code={ticket.otp_code} size="xl" className="mt-4" />

      <div className="mt-4 flex justify-center">
        <CountdownChip
          expiresAt={ticket.deals?.expires_at ?? ticket.expires_at}
          suffix="(+15 min grace)"
        />
      </div>

      <div className="mt-4 flex justify-center">
        <W3wChip address={m.what3words_address} />
      </div>

      <ButtonLink
        href={w3wHref}
        variant="ghost"
        full
        className="mt-8"
        target="_blank"
        rel="noopener noreferrer"
      >
        Navigate
      </ButtonLink>
    </main>
  );
}
