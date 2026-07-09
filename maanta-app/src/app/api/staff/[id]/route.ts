import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext } from "@/lib/merchant";

async function requireOwner() {
  const res = await getMerchantContext();
  if (res.status === "signed-out") {
    return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }
  if (res.status === "no-merchant" || !res.ctx.isOwner) {
    return {
      error: NextResponse.json(
        { error: "Only the shop owner can manage staff." },
        { status: 403 }
      ),
    };
  }
  return { merchant: res.ctx.merchant };
}

/** Update staff permissions (wireframe 10ac toggles). */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const update: Record<string, boolean> = {};
  if (typeof body.canVerify === "boolean") update.can_verify = body.canVerify;
  if (typeof body.canDeals === "boolean") update.can_deals = body.canDeals;
  if (typeof body.canTopup === "boolean") update.can_topup = body.canTopup;
  if (typeof body.canPurchase === "boolean") update.can_purchase = body.canPurchase;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: rows, error } = await service
    .from("merchant_staff")
    .update(update)
    .eq("id", params.id)
    .eq("merchant_id", auth.merchant.id)
    .select("id");

  if (error) {
    console.error("staff update failed:", error);
    return NextResponse.json({ error: "Could not update staff." }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** Remove a staff member. */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;

  const service = createServiceClient();
  const { error, count } = await service
    .from("merchant_staff")
    .delete({ count: "exact" })
    .eq("id", params.id)
    .eq("merchant_id", auth.merchant.id);

  if (error) {
    console.error("staff delete failed:", error);
    return NextResponse.json({ error: "Could not remove staff." }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
