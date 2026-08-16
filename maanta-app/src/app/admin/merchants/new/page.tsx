import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { IconArrowLeft } from "@/components/ui/icons";
import { AdminOnboardForm } from "./admin-onboard-form";

export const dynamic = "force-dynamic";

/**
 * 11-series: admin creates a shop on a merchant's behalf.
 *
 * The candidate list is the hard constraint, and it comes from the RPC: a
 * merchant row must attach to an existing `public.users` id, so the admin picks
 * a person who already has an account rather than typing a new one. Nothing in
 * the app provisions an auth identity for someone else, and inventing a way to
 * would mean creating credentials a person never consented to.
 *
 * So the list is people who have signed in at least once and are not already a
 * merchant. If the person is not there, they have not signed in yet, and the
 * page says exactly that instead of failing at submit.
 */
export default async function AdminNewMerchantPage() {
  await requireAdminPage();

  const service = createServiceClient();
  const { data: candidates } = await service
    .from("users")
    .select("id, full_name, phone, email, created_at")
    .eq("role", "customer")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <main className="max-w-2xl">
      <Link
        href="/admin/merchants"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-ink"
      >
        <IconArrowLeft className="h-4 w-4" />
        Merchants
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-ink">Onboard a shop</h1>
      <p className="mt-1 text-sm text-muted">
        Creates a pending shop and promotes the owner&apos;s account. It is recorded as
        onboarded by you, and still needs approving like any other shop.
      </p>

      <AdminOnboardForm
        candidates={(candidates ?? []).map((u) => ({
          id: u.id,
          label: u.full_name?.trim() || u.phone || u.email || "Unnamed account",
          sub: [u.phone, u.email].filter(Boolean).join(" · "),
        }))}
      />
    </main>
  );
}
