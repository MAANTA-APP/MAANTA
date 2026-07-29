import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAgentPage } from "@/lib/agent";
import { LockedChip, StatusChip } from "@/components/ui/chips";
import { IconArrowLeft, IconCheck } from "@/components/ui/icons";
import { friendlyTime, maskPhone } from "@/lib/ui";
import { LinkMerchant } from "./link-merchant";
import { SendOnboardingLink } from "./send-onboarding-link";

export const dynamic = "force-dynamic";

/**
 * G4 — Agent lead detail + lead↔merchant linkage.
 *
 * Shows one lead and whether it has become a merchant (leads.converted_to). If
 * not, the agent can link it to one of the shops *they* onboarded
 * (merchants.onboarded_by = this agent), which writes leads.converted_to +
 * status='converted'. This is attribution data only — no money, no ledger.
 */
export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { agentId } = await requireAgentPage(`/agent/leads/${params.id}`);

  const service = createServiceClient();
  const { data: lead } = await service
    .from("leads")
    .select(
      "id, agent_id, shop_name, owner_name, phone, unit_number, what3words_address, notes, status, locked_until, converted_to, created_at, merchants:converted_to(id, merchant_name, status)"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!lead) notFound();

  // An agent may only see their own leads (admins may open any).
  if (agentId && lead.agent_id !== agentId) notFound();

  const linkedMerchant = lead.merchants as unknown as {
    id: string;
    merchant_name: string;
    status: string;
  } | null;

  const hoursLeft = Math.max(
    0,
    Math.round((new Date(lead.locked_until).getTime() - Date.now()) / 3600_000)
  );

  // Merchants this agent onboarded that aren't yet tied to a lead — the only
  // candidates offered, keeping the attribution boundary tight.
  let candidates: { id: string; merchant_name: string; status: string }[] = [];
  const canLink = !lead.converted_to && agentId && lead.agent_id === agentId;
  if (canLink) {
    const [{ data: mine }, { data: taken }] = await Promise.all([
      service
        .from("merchants")
        .select("id, merchant_name, status")
        .eq("onboarded_by", agentId)
        .order("created_at", { ascending: false })
        .limit(50),
      service
        .from("leads")
        .select("converted_to")
        .eq("agent_id", agentId)
        .not("converted_to", "is", null),
    ]);
    const used = new Set((taken ?? []).map((t) => t.converted_to as string));
    candidates = (mine ?? []).filter((m) => !used.has(m.id));
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-mobile border-x border-line bg-white px-4 pb-10 pt-5">
      <div className="flex items-center gap-3">
        <Link href="/agent/leads" aria-label="Back" className="p-1">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 truncate text-center text-lg font-bold text-ink">
          {lead.shop_name}
        </h1>
        {lead.status === "locked" && hoursLeft > 0 ? (
          <LockedChip hoursLeft={hoursLeft} />
        ) : (
          <StatusChip status={lead.status} />
        )}
      </div>

      {/* Conversion state */}
      {linkedMerchant ? (
        <Link
          href={`/agent`}
          className="mt-5 flex items-center gap-2.5 rounded-card border border-line bg-cream px-4 py-3.5"
        >
          <IconCheck className="h-4 w-4 shrink-0 text-verified" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">
              Converted — {linkedMerchant.merchant_name}
            </p>
            <p className="mt-0.5 text-xs text-muted">This lead is linked to a merchant.</p>
          </div>
        </Link>
      ) : (
        <>
          <p className="mt-5 rounded-card border border-line bg-white px-4 py-3 text-sm text-muted">
            Not yet a merchant.
          </p>
          {/* Frame 13b primary action (R-AGENT-NO-SUBMIT). */}
          <SendOnboardingLink shopName={lead.shop_name} phone={lead.phone} />
        </>
      )}

      {/* Lead details */}
      <div className="mt-4 space-y-2.5">
        <DetailRow label="Owner" value={lead.owner_name} />
        <DetailRow label="Phone" value={lead.phone ? maskPhone(lead.phone) : null} />
        <DetailRow label="Floor / unit" value={lead.unit_number} />
        <DetailRow
          label="what3words"
          value={lead.what3words_address ? `///${lead.what3words_address}` : null}
          mono
        />
        <DetailRow label="Captured" value={friendlyTime(lead.created_at)} />
        {lead.notes ? (
          <div className="rounded-card border border-line bg-white px-4 py-3">
            <p className="text-xs text-muted">Notes</p>
            <p className="mt-0.5 text-sm text-ink">{lead.notes}</p>
          </div>
        ) : null}
      </div>

      {/* Linkage tool — single amber primary action on this screen. */}
      {canLink ? (
        <LinkMerchant leadId={lead.id} candidates={candidates} />
      ) : null}
    </main>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-3">
      <span className="text-xs text-muted">{label}</span>
      <span className={"text-sm font-semibold text-ink" + (mono ? " font-mono" : "")}>
        {value ?? "—"}
      </span>
    </div>
  );
}
