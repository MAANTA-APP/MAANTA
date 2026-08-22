import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext } from "@/lib/merchant";
import { getAppUser } from "@/lib/data";
import { StatusChip } from "@/components/ui/chips";
import { ButtonLink } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** 10w Staff management. */
export default async function StaffPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, isOwner } = res.ctx;
  const user = await getAppUser();

  if (!isOwner) {
    return (
      <main className="px-6 py-24 text-center">
        <p className="text-sm font-semibold text-ink">Only the shop owner can manage staff.</p>
      </main>
    );
  }

  const service = createServiceClient();
  const { data: staff } = await service
    .from("merchant_staff")
    .select("id, staff_name, phone, can_verify, can_deals, can_topup, can_purchase")
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: true });

  const permsLabel = (s: {
    can_verify: boolean;
    can_deals: boolean;
    can_topup: boolean;
    can_purchase: boolean;
  }) => {
    const parts: string[] = [];
    if (s.can_verify) parts.push("Verify");
    if (s.can_deals) parts.push("Create deals");
    if (s.can_topup) parts.push("Top up");
    if (s.can_purchase) parts.push("Purchase");
    if (parts.length === 1 && s.can_verify) return "Verify only";
    return parts.join(" · ") || "No permissions";
  };

  return (
    <main className="px-4 pt-5">
      <h1 className="text-center text-lg font-bold text-ink">Staff</h1>
      <p className="mt-2 text-center text-xs text-muted">
        Staff can verify redemption codes with their own phone sign-in.
      </p>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between rounded-card bg-white shadow-card px-4 py-3.5">
          <div>
            <p className="text-sm font-bold text-ink">You</p>
            <p className="mt-0.5 text-xs text-muted">{user?.phone ?? merchant.phone}</p>
          </div>
          <StatusChip status="owner" label="Owner" />
        </div>

        {(staff ?? []).map((s) => (
          <Link
            key={s.id}
            href={`/merchant/staff/${s.id}`}
            className="flex items-center justify-between rounded-card bg-white shadow-card px-4 py-3.5 hover:bg-cream/50"
          >
            <div>
              <p className="text-sm font-bold text-ink">{s.staff_name}</p>
              <p className="mt-0.5 text-xs text-muted">{permsLabel(s)}</p>
            </div>
            <span className="text-sm text-muted underline">Manage ›</span>
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <ButtonLink href="/merchant/staff/new" variant="ghost" full>
          + Add staff
        </ButtonLink>
      </div>
    </main>
  );
}
