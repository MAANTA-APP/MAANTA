import { redirect } from "next/navigation";
import Link from "next/link";
import { getAppUser, getFavouriteMerchantIds, getSelectedNode } from "@/lib/data";
import { maskPhone } from "@/lib/ui";
import { SettingsRow } from "@/components/ui/cards";
import SignOutButton from "@/app/sign-out-button";
import {
  Body,
  HeadingLg,
  HeadingMd,
  Meta,
  Page,
  Section,
} from "@/components/ui/claude";
import { nodeLabel } from "@/lib/nodes";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/** 8q Profile / settings — Claude-style sections. */
export default async function ProfilePage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/profile");

  const node = getSelectedNode();
  const favourites = await getFavouriteMerchantIds(user.id);

  let favouriteNames: string[] = [];
  if (favourites.size > 0) {
    const service = createServiceClient();
    const { data } = await service
      .from("merchants")
      .select("merchant_name")
      .in("id", Array.from(favourites))
      .limit(6);
    favouriteNames = (data ?? []).map((m) => m.merchant_name).filter(Boolean);
  }

  return (
    <Page className="px-0 pt-6">
      <div className="px-4">
        <HeadingLg>Profile</HeadingLg>
        <Body className="mt-1">Your Maanta account at a glance.</Body>
      </div>

      <Section className="mt-6">
        <div className="flex items-center gap-4 rounded-card border border-line bg-white p-4 shadow-card">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-stone text-2xl font-semibold text-ink">
            {(user.full_name || "M").trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <HeadingMd as="h2" className="truncate">
              {user.full_name || "Maanta shopper"}
            </HeadingMd>
            <Meta as="p" className="tnum mt-1 text-xs">
              Nairobi{user.phone ? ` · ${maskPhone(user.phone)}` : ""}
            </Meta>
          </div>
        </div>
      </Section>

      {user.email ? (
        <Section title="Contact">
          <div className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5 shadow-card">
            <span className="text-sm font-semibold text-ink">Email</span>
            <span className="truncate pl-3 text-sm text-muted">{user.email}</span>
          </div>
        </Section>
      ) : null}

      <Section
        title="Your favourites"
        subtitle={
          favourites.size === 0
            ? "Save shops from Discover to see them here"
            : `${favourites.size} saved shop${favourites.size === 1 ? "" : "s"}`
        }
        action={
          favourites.size > 0 ? (
            <Link href="/my-deals?tab=shops" className="text-xs font-semibold text-muted">
              See all ›
            </Link>
          ) : null
        }
      >
        {favouriteNames.length > 0 ? (
          <ul className="space-y-2">
            {favouriteNames.map((name) => (
              <li
                key={name}
                className="rounded-card border border-line bg-white px-4 py-3 text-sm font-semibold text-ink shadow-card"
              >
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-card border border-dashed border-line bg-white px-4 py-5 text-sm text-muted">
            Tap the heart on a deal to save a shop.
          </div>
        )}
      </Section>

      <Section title="Your mall" subtitle="Deals and Browse use this location">
        <div className="rounded-card border border-line bg-white px-4 py-3.5 shadow-card">
          <p className="text-sm font-semibold text-ink">{nodeLabel(node)}</p>
          <Meta as="p" className="mt-0.5">
            Change it anytime from the location pill on Discover.
          </Meta>
        </div>
      </Section>

      <Section title="Settings">
        <div className="space-y-3">
          <SettingsRow href="/notifications/preferences" label="Notification preferences" />
          <SettingsRow href="/help" label="Help & support" />
        </div>
      </Section>

      <div className="mt-8 px-4">
        <SignOutButton />
      </div>
    </Page>
  );
}
