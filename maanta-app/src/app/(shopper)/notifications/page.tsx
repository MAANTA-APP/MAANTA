import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser } from "@/lib/data";
import { NotificationRow } from "@/components/ui/cards";
import { EmptyState } from "@/components/ui/states";
import {
  BackToProfileLink,
  Body,
  HeadingLg,
  Page,
  Section,
} from "@/components/ui/claude";
import { NotificationPreferencesPanel } from "./preferences-panel";

export const dynamic = "force-dynamic";

type Item = { title: string; body: string; at: string; unread: boolean };

/**
 * Notifications inbox + preferences (single place — no separate preferences route).
 */
export default async function NotificationsPage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/notifications");

  const service = createServiceClient();
  const items: Item[] = [];

  const { data: pending } = await service
    .from("redemptions")
    .select("expires_at, merchants(merchant_name)")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .lt("expires_at", new Date(Date.now() + 2 * 3600_000).toISOString());
  for (const r of (pending ?? []) as unknown as {
    expires_at: string;
    merchants: { merchant_name: string } | null;
  }[]) {
    items.push({
      title: r.merchants?.merchant_name ?? "Maanta",
      body: "Your claimed code expires soon",
      at: new Date().toISOString(),
      unread: true,
    });
  }

  const { data: flagged } = await service
    .from("redemptions")
    .select("redeemed_at, merchants(merchant_name)")
    .eq("user_id", user.id)
    .eq("status", "flagged")
    .order("redeemed_at", { ascending: false })
    .limit(5);
  for (const r of (flagged ?? []) as unknown as {
    redeemed_at: string;
    merchants: { merchant_name: string } | null;
  }[]) {
    items.push({
      title: r.merchants?.merchant_name ?? "Maanta",
      body: "A redemption is under review — nothing needed from you",
      at: r.redeemed_at,
      unread: true,
    });
  }

  const { data: favs } = await service
    .from("merchant_favourites")
    .select("merchant_id")
    .eq("user_id", user.id);
  const favIds = (favs ?? []).map((f) => f.merchant_id);
  if (favIds.length > 0) {
    const { data: newDeals } = await service
      .from("deals")
      .select("created_at, deal_type, merchants(merchant_name)")
      .in("merchant_id", favIds)
      .eq("is_active", true)
      .gt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(10);
    for (const d of (newDeals ?? []) as unknown as {
      created_at: string;
      deal_type: string;
      merchants: { merchant_name: string } | null;
    }[]) {
      items.push({
        title: d.merchants?.merchant_name ?? "Maanta",
        body:
          d.deal_type === "flash"
            ? "New flash deal just dropped"
            : "New deal from a saved shop",
        at: d.created_at,
        unread: false,
      });
    }
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <Page className="px-0 pt-4">
      <div className="px-4">
        <BackToProfileLink />
        <HeadingLg className="mt-4">Notifications</HeadingLg>
        <Body className="mt-1">Deal alerts and code reminders.</Body>
      </div>

      <Section title="Alerts" className="mt-6">
        {items.length === 0 ? (
          <EmptyState title="Nothing yet" sub="Deal alerts and code reminders land here" />
        ) : (
          <div className="space-y-3">
            {items.map((n, i) => (
              <NotificationRow key={i} {...n} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Preferences" className="mt-2">
        <NotificationPreferencesPanel />
      </Section>
    </Page>
  );
}
