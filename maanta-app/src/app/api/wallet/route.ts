import { NextResponse } from "next/server";
import { requireMerchant } from "@/lib/merchant-api";

/** Current wallet balance (polled by the top-up screen while waiting for STK). */
export async function GET() {
  const auth = await requireMerchant();
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;
  return NextResponse.json({
    balance: merchant.account_balance,
    arrears: merchant.outstanding_arrears,
  });
}
