import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAppUser } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const appUser = await ensureAppUser<{ id: string; role: string }>("id, role");
  if (!appUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (appUser.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const service = createServiceClient();

  const body = await request.json().catch(() => ({}));
  const grantEliteTrial = body?.grantEliteTrial === true;

  // activate_merchant grants a 30-day Elite trial when requested (DB behavior;
  // wireframe 11j says 14 days — flagged as an open spec/DB conflict).
  const { error } = await service.rpc("activate_merchant", {
    p_merchant_id: params.id,
    p_admin_user_id: appUser.id,
    p_grant_elite_trial: grantEliteTrial,
  });

  if (error) {
    console.error("Failed to activate merchant:", error);
    return NextResponse.json(
      { error: error.message || "Could not approve this shop." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
