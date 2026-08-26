import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/data";
import { ButtonLink } from "@/components/ui/button";
import { QrCheckIn } from "./qr-check-in";

export const dynamic = "force-dynamic";

/**
 * Landing page for a scanned merchant counter QR (`/qr/<token>`).
 *
 * The token identifies the merchant and authorizes nothing — this page only
 * ever shows the shopper THEIR OWN claims at that shop, and the check-in
 * itself re-authorizes through `record_shopper_arrival`. One QR identity per
 * merchant: entrance and till stickers carry the same token, and the
 * shopper's state (no claim / one claim / several / already checked in)
 * decides what happens.
 *
 * v1 rules (founder brief 2026-08-26): no claim is ever auto-created from a
 * scan, and no discovery surface grows here — the no-claim state links to
 * the existing shop page, nothing more.
 */

const TOKEN_SHAPE = /^[0-9a-f]{32}$/;

function Unavailable() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold text-ink">
        This code doesn&apos;t match a MAANTA shop
      </h1>
      <p className="mt-2 text-sm text-secondary">
        The sticker may be outdated. You can still claim and redeem deals as
        usual.
      </p>
      <ButtonLink href="/feed" full className="mt-8">
        See live deals
      </ButtonLink>
    </main>
  );
}

export default async function QrLandingPage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  if (!TOKEN_SHAPE.test(token)) return <Unavailable />;

  const user = await getAppUser();
  if (!user) redirect(`/login?next=/qr/${token}`);

  const service = createServiceClient();
  const { data: merchant } = await service
    .from("merchants")
    .select("id, merchant_name, floor, status, is_visible, is_shadow_banned")
    .eq("qr_token", token)
    .maybeSingle<{
      id: string;
      merchant_name: string;
      floor: string | null;
      status: string;
      is_visible: boolean;
      is_shadow_banned: boolean;
    }>();
  if (
    !merchant ||
    merchant.status !== "active" ||
    !merchant.is_visible ||
    merchant.is_shadow_banned
  ) {
    return <Unavailable />;
  }

  const nowIso = new Date().toISOString();
  const { data: claimRows } = await service
    .from("redemptions")
    .select("id, expires_at, deals(title)")
    .eq("user_id", user.id)
    .eq("merchant_id", merchant.id)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: true });

  const claims = ((claimRows ?? []) as unknown as Array<{
    id: string;
    expires_at: string;
    deals: { title: string } | null;
  }>).map((row) => ({
    redemptionId: row.id,
    dealTitle: row.deals?.title ?? "Deal",
  }));

  const { data: waiting } = await service
    .from("merchant_presentations")
    .select("redemption_id")
    .eq("shopper_id", user.id)
    .eq("merchant_id", merchant.id)
    .eq("status", "waiting")
    .gt("expires_at", nowIso)
    .maybeSingle<{ redemption_id: string }>();

  return (
    <main className="px-5 pb-10 pt-8">
      <QrCheckIn
        token={token}
        merchantId={merchant.id}
        merchantName={merchant.merchant_name}
        merchantFloor={merchant.floor}
        claims={claims}
        alreadyCheckedInFor={waiting?.redemption_id ?? null}
      />
    </main>
  );
}
