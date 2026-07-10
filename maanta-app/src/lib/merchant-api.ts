import { NextResponse } from "next/server";
import { getMerchantContext, type MerchantContext, type StaffPermissions } from "@/lib/merchant";

/**
 * Route-handler guard: resolve merchant context and enforce a staff
 * permission (owners hold all permissions).
 */
export async function requireMerchant(
  permission?: keyof StaffPermissions
): Promise<{ ctx: MerchantContext } | { error: NextResponse }> {
  const res = await getMerchantContext();
  if (res.status === "signed-out") {
    return {
      error: NextResponse.json({ error: "Sign in required." }, { status: 401 }),
    };
  }
  if (res.status === "no-merchant") {
    return {
      error: NextResponse.json({ error: "No merchant account found." }, { status: 404 }),
    };
  }
  if (permission && !res.ctx.permissions[permission]) {
    return {
      error: NextResponse.json(
        { error: "You don't have permission to do this." },
        { status: 403 }
      ),
    };
  }
  return { ctx: res.ctx };
}
