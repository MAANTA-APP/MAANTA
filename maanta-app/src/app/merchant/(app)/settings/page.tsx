import { getMerchantContext } from "@/lib/merchant";
import { SettingsRow } from "@/components/ui/cards";
import SignOutButton from "@/app/sign-out-button";
import { AvatarUpload, Body, HeadingLg, Page, Section } from "@/components/ui/claude";

export const dynamic = "force-dynamic";

/** 10j Merchant profile / settings. */
export default async function MerchantSettingsPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, isOwner } = res.ctx;

  return (
    <Page className="px-0 pt-5">
      <div className="px-4">
        <HeadingLg>Settings</HeadingLg>
        <Body className="mt-1">Business details and shop photo.</Body>
      </div>

      <Section title="Shop photo" className="mt-6">
        <div className="rounded-card border border-line bg-white p-4 shadow-card">
          <AvatarUpload
            avatarUrl={merchant.avatar_url ?? null}
            initials={merchant.merchant_name}
            uploadUrl="/api/merchant/avatar"
            disabled={!isOwner}
          />
          {!isOwner ? (
            <Body className="mt-2 text-xs">
              Only the business owner can change the shop photo.
            </Body>
          ) : null}
        </div>
      </Section>

      <Section title="Account">
        <div className="space-y-3">
          <SettingsRow label="Business details" value={merchant.merchant_name} />
          <SettingsRow
            label="Location & floor"
            value={[merchant.floor, merchant.unit_number].filter(Boolean).join(", ")}
          />
          <SettingsRow href="/merchant/plan" label="Plan & billing" />
          {isOwner ? <SettingsRow href="/merchant/staff" label="Staff" /> : null}
          <SettingsRow href="/merchant/support" label="Support" />
        </div>
      </Section>

      <div className="mt-8 px-4">
        <SignOutButton />
      </div>
    </Page>
  );
}
