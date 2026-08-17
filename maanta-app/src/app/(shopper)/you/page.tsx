import { redirect } from "next/navigation";
import Link from "next/link";
import { getAppUser, getFavouriteMerchantIds, getSelectedNode } from "@/lib/data";
import { maskPhone } from "@/lib/ui";
import { SettingsRow } from "@/components/ui/cards";
import SignOutButton from "@/app/sign-out-button";
import {
  Body,
  HeadingLg,
  Meta,
  Page,
  Section,
} from "@/components/ui/claude";
import { nodeLabel } from "@/lib/nodes";
import { createServiceClient } from "@/lib/supabase/service";
import { LanguageCard, ProfileCard } from "../profile/profile-card";

export const dynamic = "force-dynamic";

/** You / Profile — Claude-style sections (wireframe canonical route). */
export default async function YouPage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/you");

  const node = getSelectedNode();
  const favourites = await getFavouriteMerchantIds(user.id);

  const service = createServiceClient();
  const { data: prefs, error: prefsError } = await service
    .from("users")
    .select("preferred_language, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const preferredLanguage =
    !prefsError && prefs?.preferred_language === "sw"
      ? ("sw" as const)
      : ("en" as const);
  const avatarUrl =
    !prefsError && typeof prefs?.avatar_url === "string" ? prefs.avatar_url : null;

  let favouriteNames: string[] = [];
  if (favourites.size > 0) {
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
        <HeadingLg>You</HeadingLg>
        <Body className="mt-1">Your Maanta account at a glance.</Body>
      </div>

      <Section className="mt-6">
        <ProfileCard
          fullName={user.full_name}
          phoneMasked={user.phone ? maskPhone(user.phone) : null}
          preferredLanguage={preferredLanguage}
          node={node}
          avatarUrl={avatarUrl}
        />
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
            Change it anytime from Edit profile or the location pill on Discover.
          </Meta>
        </div>
      </Section>

      <Section title="Language" subtitle="More languages coming soon">
        <LanguageCard preferredLanguage={preferredLanguage} />
      </Section>

      <Section title="Settings">
        <div className="space-y-3">
          <SettingsRow href="/you/notifications" label="Notifications" />
          <SettingsRow href="/you/help" label="Help & support" />
        </div>
      </Section>

      <div className="mt-8 px-4">
        <SignOutButton />
      </div>
    </Page>
  );
}
