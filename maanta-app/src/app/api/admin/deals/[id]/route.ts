import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";

/** 11c "Remove deal" — deactivates it (archive trigger snapshots it). */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const service = createServiceClient();
  const { data: rows, error } = await service
    .from("deals")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("id");

  if (error) {
    console.error("deal removal failed:", error);
    return NextResponse.json({ error: "Could not remove the deal." }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
