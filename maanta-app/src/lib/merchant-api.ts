import { NextResponse } from "next/server";
import { getMerchantContext, type MerchantContext, type StaffPermissions } from "@/lib/merchant";

/**
 * Route-handler guard: resolve merchant context and enforce a staff
 * permission (owners hold all permissions).
 */
const BLOCKED_MERCHANT_STATUSES = new Set(["suspended", "rejected", "churned"]);

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
  if (BLOCKED_MERCHANT_STATUSES.has(res.ctx.merchant.status)) {
    return {
      error: NextResponse.json(
        { error: "This shop account is not active." },
        { status: 403 }
      ),
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
