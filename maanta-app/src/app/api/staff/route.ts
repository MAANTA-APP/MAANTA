import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext } from "@/lib/merchant";

/** Add a staff member (wireframe 10y/10ac/10aa). Owner only. */
export async function POST(request: Request) {
  const res = await getMerchantContext();
  if (res.status === "signed-out") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (res.status === "no-merchant" || !res.ctx.isOwner) {
    return NextResponse.json(
      { error: "Only the shop owner can manage staff." },
      { status: 403 }
    );
  }
  const { merchant } = res.ctx;

  const { staffName, phone, canVerify, canDeals, canTopup, canPurchase } =
    await request.json();
  if (!staffName || !phone) {
    return NextResponse.json({ error: "Name and phone are required." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("merchant_staff")
    .insert({
      merchant_id: merchant.id,
      staff_name: String(staffName).trim(),
      phone: String(phone).trim(),
      can_verify: canVerify !== false,
      can_deals: !!canDeals,
      can_topup: !!canTopup,
      can_purchase: !!canPurchase,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "That phone number is already on your staff list." },
        { status: 409 }
      );
    }
    console.error("staff insert failed:", error);
    return NextResponse.json({ error: "Could not add staff." }, { status: 500 });
  }

  return NextResponse.json({ staffId: data.id });
}
