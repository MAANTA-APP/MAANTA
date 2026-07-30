import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";
import { parseCharges, type DealCharge } from "@/lib/pricing";
import { dealLimitReachedMessage } from "@/lib/deal-limits";
import {
  contentTypeForImage,
  detectImageType,
  fileExtensionForImage,
} from "@/lib/image-bytes";
import { captureDealPublished } from "@/lib/analytics";
import { currentClerkUserId } from "@/lib/auth";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Create a deal (wireframe 9n–9s). Cover image is REQUIRED (9o).
 * The insert goes through the DB triggers that are the source of truth:
 * enforce_deal_limit (1 Standard / 2 Elite, flash Elite-only),
 * set_deal_expiry (standard fixed 24h, flash 1–24h),
 * enforce_deal_success_fee (canonical app_config fee),
 * enforce_zero_balance_gate (top-up before posting).
 */
export async function POST(request: Request) {
  const auth = await requireMerchant("can_deals");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  if (merchant.status !== "active") {
    return NextResponse.json(
      { error: "Your shop is pending approval — you can publish once it's live." },
      { status: 403 }
    );
  }

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const dealType = form.get("dealType") === "flash" ? "flash" : "standard";
  const flashHours = Math.min(
    24,
    Math.max(1, parseInt(String(form.get("flashHours") ?? "6"), 10) || 6)
  );
  const maxClaimsRaw = parseInt(String(form.get("maxClaims") ?? ""), 10);
  const maxClaims =
    isNaN(maxClaimsRaw) || maxClaimsRaw <= 0 ? null : Math.min(maxClaimsRaw, 10000);
  const cover = form.get("cover");

  // Price policy (brief §4/§10): a deal must carry the base amount the shopper
  // pays, plus the disclosed extras that fold into YOU PAY. The M9 disclosure
  // step is mandatory, so a missing price is a client bug, not a valid deal.
  const priceRaw = form.get("price");
  const priceKes =
    priceRaw == null || String(priceRaw).trim() === ""
      ? NaN
      : parseInt(String(priceRaw).replace(/\D/g, ""), 10);
  const compareRaw = parseInt(String(form.get("compareAt") ?? "").replace(/\D/g, ""), 10);
  const compareAtKes =
    isNaN(compareRaw) || compareRaw <= 0 ? null : Math.min(compareRaw, 10_000_000);
  let charges: DealCharge[];
  try {
    charges = parseCharges(JSON.parse(String(form.get("charges") ?? "[]")));
  } catch {
    charges = [];
  }

  if (!title) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (isNaN(priceKes) || priceKes < 0 || priceKes > 10_000_000) {
    return NextResponse.json(
      { error: "Enter the price the shopper pays." },
      { status: 400 }
    );
  }
  if (!(cover instanceof File) || cover.size === 0) {
    return NextResponse.json(
      { error: "A cover image is required to continue." },
      { status: 400 }
    );
  }
  if (cover.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Cover image must be under 5MB." }, { status: 400 });
  }

  const bytes = Buffer.from(await cover.arrayBuffer());
  const detectedType = detectImageType(bytes);
  if (!detectedType) {
    return NextResponse.json(
      { error: "Cover must be a JPEG, PNG or WebP image." },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const path = `${merchant.id}/${randomUUID()}.${fileExtensionForImage(detectedType)}`;
  const { error: uploadError } = await service.storage
    .from("deal-images")
    .upload(path, bytes, {
      contentType: contentTypeForImage(detectedType),
      upsert: false,
    });
  if (uploadError) {
    console.error("cover upload failed:", uploadError);
    return NextResponse.json(
      { error: "Could not upload the cover image. Please try again." },
      { status: 502 }
    );
  }
  const {
    data: { publicUrl },
  } = service.storage.from("deal-images").getPublicUrl(path);

  const { data: deal, error } = await service
    .from("deals")
    .insert({
      merchant_id: merchant.id,
      node: merchant.node,
      title,
      description: description || null,
      image_url: publicUrl,
      deal_type: dealType,
      flash_duration_hours: flashHours,
      max_claims: maxClaims,
      price_kes: priceKes,
      // Only show a struck "Was" when it is genuinely higher than the base price.
      compare_at_kes: compareAtKes && compareAtKes > priceKes ? compareAtKes : null,
      charges,
    })
    .select("id, expires_at")
    .single();

  if (error || !deal) {
    const message = error?.message ?? "";
    let status = 500;
    let userMessage = "Could not publish the deal. Please try again.";
    if (message.includes("Flash deals are only available")) {
      status = 403;
      userMessage = "Flash deals are only available on the Elite plan.";
    } else if (message.includes("Deal limit reached")) {
      status = 409;
      // Product copy, not the raw trigger text ("Deal limit reached. standard
      // plan allows 1 active deal(s)."). Same sentence the wizard shows when it
      // blocks up front, so the merchant never sees two phrasings of one rule.
      userMessage = dealLimitReachedMessage(merchant.tier);
    } else if (message.includes("INSUFFICIENT_BALANCE_FOR_NEW_DEAL")) {
      status = 402;
      userMessage = "Your wallet balance is too low — top up before publishing a deal.";
    } else {
      console.error("deal insert failed:", error);
    }
    // best-effort cleanup of the uploaded cover
    await service.storage.from("deal-images").remove([path]);
    return NextResponse.json({ error: userMessage }, { status });
  }

  const clerkUserId = await currentClerkUserId();
  if (clerkUserId) {
    void captureDealPublished({
      clerkUserId,
      dealId: deal.id,
      merchantId: merchant.id,
      dealType: dealType,
      priceKes: priceKes,
      hasMaxClaims: maxClaims !== null,
      node: merchant.node,
    });
  }

  return NextResponse.json({ dealId: deal.id, expiresAt: deal.expires_at });
}
