import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { IconArrowLeft } from "@/components/ui/icons";
import { NewTicketForm } from "./new-ticket-form";
import { AdminReadError } from "@/components/admin/read-error";

export const dynamic = "force-dynamic";

/**
 * 11e Log a support ticket. Admin-raised issues — escalations from the field
 * (agent, node manager) and direct contact (stall visit, WhatsApp, social
 * media, email, phone) — land in the same agent_tasks queue the support screen
 * works, with intake recorded on the ticket.
 *
 * Every ticket names a merchant because agent_tasks.merchant_id is NOT NULL.
 * A shopper- or platform-shaped issue with no merchant needs a schema decision
 * first — that gap is stated in lib/support-intake.ts, not papered over here.
 */
export default async function NewSupportTicketPage({
  searchParams,
}: {
  searchParams: { merchant?: string };
}) {
  await requireAdminPage();

  const service = createServiceClient();
  const { data: merchants, error } = await service
    .from("merchants")
    .select("id, merchant_name")
    .order("merchant_name", { ascending: true })
    .limit(500);

  if (error) {
    return (
      <main className="max-w-4xl">
        <h1 className="text-2xl font-bold text-ink">Log an issue</h1>
        <div className="mt-5"><AdminReadError what="the merchant list for support intake" /></div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl">
      <Link
        href="/admin/support"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-ink"
      >
        <IconArrowLeft className="h-4 w-4" />
        Support
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-ink">Log an issue</h1>
      <p className="mt-1 text-sm text-muted">
        Lands in the open queue like any other issue, with how it reached you recorded on
        the ticket.
      </p>

      <NewTicketForm
        merchants={(merchants ?? []).map((m) => ({ id: m.id, name: m.merchant_name }))}
        initialMerchantId={
          (merchants ?? []).some((m) => m.id === searchParams.merchant) ? searchParams.merchant : ""
        }
      />
    </main>
  );
}
