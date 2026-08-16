import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";
import { isValidKenyanPhone } from "@/lib/phone";
import { NODES } from "@/lib/nodes";

/**
 * Admin-assisted merchant onboarding.
 *
 * Separate from `/api/merchants/onboard`, which is the merchant-authored path
 * and must stay that way: there the submitter IS the merchant, and an agent can
 * only be attribution. Here the admin is genuinely the actor, and the record
 * says so — `onboarding_mode = 'admin_assisted'`, `onboarded_by_user_id` = the
 * admin.
 *
 * That truthfulness needs migration `20260816020000`, which adds the validated
 * `p_admin_user_id` parameter. Until it is applied, this route fails closed
 * with a 503 naming the migration rather than falling back to the 11-argument
 * call — that fallback would record the merchant as having self-served, which
 * is a false statement in a column the dispute and fraud paths read.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const admin = auth.user;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const userId = str("userId");
  const merchantName = str("merchantName");
  const phone = str("phone");
  const node = str("node");
  const what3wordsAddress = str("what3wordsAddress");

  if (!userId) {
    return NextResponse.json(
      { error: "Choose the person who will own this shop.", code: "user_required" },
      { status: 400 }
    );
  }
  if (merchantName.length < 2) {
    return NextResponse.json(
      { error: "Shop name is required.", code: "name_required" },
      { status: 400 }
    );
  }
  if (!isValidKenyanPhone(phone)) {
    return NextResponse.json(
      { error: "A valid Kenyan phone number is required.", code: "phone_invalid" },
      { status: 400 }
    );
  }
  if (!NODES.some((n) => n.id === node)) {
    return NextResponse.json(
      { error: "Choose a node.", code: "node_invalid" },
      { status: 400 }
    );
  }
  // what3words is mandatory on the merchant-authored form; an admin-created shop
  // is not exempt — it is what makes the shop findable in-mall.
  if (!what3wordsAddress) {
    return NextResponse.json(
      { error: "A what3words address is required.", code: "w3w_required" },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: merchantId, error } = await service.rpc("onboard_merchant", {
    p_user_id: userId,
    p_merchant_name: merchantName,
    p_phone: phone,
    p_email: str("email"),
    p_whatsapp: str("whatsapp"),
    p_node: node,
    p_w3w_address: what3wordsAddress,
    p_floor: str("floor"),
    p_unit_number: str("unitNumber"),
    p_entrance_notes: str("entranceNotes"),
    p_onboarding_agent_id: null,
    p_admin_user_id: admin.id,
  });

  if (error) {
    const msg = error.message ?? "";

    // The migration is not applied on this database. Say so precisely — the
    // alternative (retrying without the parameter) would write a false record.
    if (/p_admin_user_id|does not exist|schema cache/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "Admin-assisted onboarding needs migration 20260816020000_admin_assisted_onboarding_attribution.sql applied. Until then, the merchant must submit their own onboarding.",
          code: "migration_required",
        },
        { status: 503 }
      );
    }
    if (msg.includes("already_merchant") || msg.includes("merchant_exists")) {
      return NextResponse.json(
        { error: "That person already has a shop.", code: "already_merchant" },
        { status: 409 }
      );
    }
    if (msg.includes("user_not_found")) {
      return NextResponse.json(
        {
          error: "No Maanta account for that person yet — they must sign in once first.",
          code: "user_not_found",
        },
        { status: 404 }
      );
    }
    if (msg.includes("invalid_attribution")) {
      return NextResponse.json(
        { error: "Attribution rejected by the database.", code: "invalid_attribution" },
        { status: 400 }
      );
    }
    console.error("admin onboard_merchant failed:", msg);
    return NextResponse.json({ error: "Could not create the shop." }, { status: 500 });
  }

  await logAdminOp(service, {
    adminUserId: admin.id,
    action: "merchant.onboard",
    targetType: "merchant",
    targetId: merchantId as string,
    details: { merchantName, node, onboardedUserId: userId, mode: "admin_assisted" },
  });

  return NextResponse.json({ ok: true, merchantId }, { status: 201 });
}
