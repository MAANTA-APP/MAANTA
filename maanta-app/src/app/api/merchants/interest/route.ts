import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isWaitlistTestToken } from "@/lib/growth/waitlist-test-token";
import { MERCHANT_CONTACT_CONSENT_TEXT, validateMerchantInterest } from "@/lib/merchant-interest";
import {
  checkRateLimit,
  MERCHANT_INTEREST_RATE_LIMIT,
  MERCHANT_INTEREST_RATE_WINDOW_SECONDS,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Public merchant-interest form → a row on the growth board.
 *
 * Mirrors `/api/waitlist` rule for rule, because it is the same class of
 * endpoint: unauthenticated, and it mints rows in a table the admin console
 * reads as pipeline.
 *
 * - The TEST marker comes from the shared secret, never the body.
 * - Honeypot: pretend success, store nothing.
 * - Rate-limited on the client IP plus a digest of the phone number — never the
 *   number itself, because `api_rate_limit_buckets` keeps its rows (SEC-011).
 * - Never logs `error.message`: a unique violation here renders the unit.
 *
 * A second submission for a unit that already has a live lead is reported as
 * "already registered", not as an error and not as a second card — the partial
 * unique index on (floor, unit) for live leads is what makes that true.
 */

function isHoneypotTripped(body: Record<string, unknown>): boolean {
  const value = body.hp_url;
  return typeof value === "string" && value.trim().length > 0;
}

function bucketKey(request: Request, phone: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const rawIp =
    forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  const ip = rawIp.replace(/[^0-9a-f.:]/gi, "").slice(0, 45) || "unknown";
  const subject = createHash("sha256").update(phone, "utf8").digest("hex").slice(0, 32);
  return `merchant-interest:${ip}:${subject}`;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof body === "object" && body !== null && isHoneypotTripped(body as Record<string, unknown>)) {
    return NextResponse.json({ ok: true, alreadyRegistered: false });
  }

  const isTest = isWaitlistTestToken((body as { testToken?: unknown })?.testToken);
  const result = validateMerchantInterest(body, { isTest });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    bucketKey(request, result.data.phone),
    MERCHANT_INTEREST_RATE_LIMIT,
    MERCHANT_INTEREST_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts \u2014 try again later." },
      { status: 429 }
    );
  }

  const lead = result.data;
  const now = new Date().toISOString();
  const service = createServiceClient();
  const { error } = await service.from("growth_merchant_leads").insert({
    floor: lead.floor,
    unit: lead.unit,
    category: lead.category,
    contact_name: lead.contactName,
    contact_phone: lead.phone,
    shop_name: lead.shopName,
    mall: lead.mall,
    counter_staff: lead.counterStaff,
    elite_trial_opt_in: lead.eliteTrialOptIn,
    source: "public_form",
    consent_at: now,
    consent_text: MERCHANT_CONTACT_CONSENT_TEXT,
    utm_source: lead.utmSource,
    utm_medium: lead.utmMedium,
    utm_campaign: lead.utmCampaign,
    is_test: lead.isTest,
    test_label: lead.testLabel,
    stage: "new",
  });

  if (error) {
    // 23505: this unit already has a live lead. The merchant is on the list;
    // telling them otherwise would make them submit again.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, alreadyRegistered: true });
    }
    // Code only (SEC-011): a constraint message names the unit and the number.
    console.error("merchant interest: insert failed", { code: error.code });
    return NextResponse.json(
      { error: "Could not save that right now. Please try again in a minute." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, alreadyRegistered: false });
}
