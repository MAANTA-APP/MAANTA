import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";

/** Delete an archived deal snapshot (wireframe 10q "Delete"). */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireMerchant("can_deals");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  const service = createServiceClient();
  const { error, count } = await service
    .from("archive_history")
    .delete({ count: "exact" })
    .eq("id", params.id)
    .eq("merchant_id", merchant.id);

  if (error) {
    console.error("archive delete failed:", error);
    return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Archived deal not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
