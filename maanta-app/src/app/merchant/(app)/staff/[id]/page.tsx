import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext } from "@/lib/merchant";
import { ManageStaff } from "./manage-staff";

export const dynamic = "force-dynamic";

/** 10ac Manage staff permissions (edit + remove). */
export default async function ManageStaffPage({
  params,
}: {
  params: { id: string };
}) {
  const res = await getMerchantContext();
  if (res.status !== "ok" || !res.ctx.isOwner) return null;
  const { merchant } = res.ctx;

  const service = createServiceClient();
  const { data: staff } = await service
    .from("merchant_staff")
    .select("id, staff_name, phone, can_verify, can_deals, can_topup, can_purchase")
    .eq("id", params.id)
    .eq("merchant_id", merchant.id)
    .maybeSingle();
  if (!staff) notFound();

  return (
    <ManageStaff
      staffId={staff.id}
      name={staff.staff_name}
      phone={staff.phone}
      initial={{
        canVerify: staff.can_verify,
        canDeals: staff.can_deals,
        canTopup: staff.can_topup,
        canPurchase: staff.can_purchase,
      }}
    />
  );
}
