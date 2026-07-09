import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";

/** 11b ops actions: reject / suspend / reinstate / feature / shadow-ban. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { action } = await request.json();
  const service = createServiceClient();

  const updates: Record<string, Record<string, unknown>> = {
    reject: { status: "churned" },
    suspend: { status: "suspended" },
    reactivate: { status: "active" },
    feature: { is_featured: true },
    unfeature: { is_featured: false },
    "shadow-ban": { is_shadow_banned: true },
    unban: { is_shadow_banned: false },
  };
  const update = updates[action as string];
  if (!update) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { data: rows, error } = await service
    .from("merchants")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("id");

  if (error) {
    console.error("ops action failed:", error);
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
