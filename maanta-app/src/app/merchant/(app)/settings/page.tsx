import { getMerchantContext } from "@/lib/merchant";
import { SettingsRow } from "@/components/ui/cards";
import SignOutButton from "@/app/sign-out-button";

export const dynamic = "force-dynamic";

/** 10j Merchant profile / settings. */
export default async function MerchantSettingsPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, isOwner } = res.ctx;

  return (
    <main className="px-4 pt-5">
      <h1 className="text-2xl font-bold text-ink">Settings</h1>
      <div className="mt-6 space-y-3">
        <SettingsRow
          href="/merchant/settings"
          label="Business details"
          value={merchant.merchant_name}
        />
        <SettingsRow
          href="/merchant/settings"
          label="Location & floor"
          value={[merchant.floor, merchant.unit_number].filter(Boolean).join(", ")}
        />
        <SettingsRow href="/merchant/plan" label="Plan & billing" />
        {isOwner ? <SettingsRow href="/merchant/staff" label="Staff" /> : null}
        <SettingsRow href="/merchant/support" label="Support" />
      </div>
      <div className="mt-8">
        <SignOutButton />
      </div>
    </main>
  );
}
