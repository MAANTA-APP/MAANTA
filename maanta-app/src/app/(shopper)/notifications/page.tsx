import { redirect } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser, withPublicMerchant } from "@/lib/data";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import { VERIFICATION_BLOCKING_MERCHANT_STATUSES } from "@/lib/merchant-visibility";
import { isActionableQueueCallNotification } from "@/lib/queue-call-notification";
import { NotificationList } from "@/components/shopper/notification-list";
import {
  BackToYouLink,
  Body,
  HeadingLg,
  Page,
  Section,
} from "@/components/ui/claude";

export const dynamic = "force-dynamic";

type Item = {
  title: string;
  body: string;
  at: string;
  unread: boolean;
  /** When this notification STARTS being true. Absent means "already". */
  visibleFrom?: string | null;
  /**
   * When this notification stops being true. D213 criterion 3 — the code
   * reminder below is built from `expires_at > now`, so it is a time-derived
   * claim like any other and must not outlive its own deadline on an open page.
   * Most rows are records of a past event and carry no expiry.
   */
  expiresAt?: string | null;
};

/**
 * Demo exclusion for a shopper's OWN redemptions (D216).
 *
 * Both sides, per D188: `claim_deal` never sets `redemptions.is_demo`, so every
 * claim made through the product is tagged `false` — including a claim against
 * a synthetic merchant. Filtering the row alone would let a demo shop's name
 * render in launch mode, so the parent is filtered too. The join must be
 * `!inner`: on a left join PostgREST nulls the embed instead of dropping the
 * row, so a `merchants.*` predicate would silently do nothing.
 */
function withoutDemo<T>(query: T, includeDemo: boolean): T {
  if (includeDemo) return query;
  const chained = query as unknown as {
    eq: (col: string, val: unknown) => typeof chained;
  };
  return chained.eq("is_demo", false).eq("merchants.is_demo", false) as unknown as T;
}

/**
 * Notifications inbox (alerts only).
 * Preference toggles live at the wireframe canonical `/you/notifications`.
 */
export default async function NotificationsPage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/notifications");

  const service = createServiceClient();
  const includeDemo = await isDemoModeEnabled();
  const items: Item[] = [];

  // Durable operational alerts. Queue call-forward writes this row in the
  // same transaction as the authoritative `waiting -> called` transition, so
  // the inbox does not depend on web push delivery or an open QR page.
  const { data: recordedNotifications } = await service
    .from("notifications")
    .select(
      "id, title, message, is_read, created_at, expires_at, presentation_id, merchant_presentations(status, expires_at, redemptions(status))"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const n of (recordedNotifications ?? []) as unknown as Array<{
    id: string;
    title: string;
    message: string;
    is_read: boolean;
    created_at: string;
    expires_at: string | null;
    presentation_id: string | null;
    merchant_presentations: {
      status: string;
      expires_at: string;
      redemptions: { status: string } | null;
    } | null;
  }>) {
    const presentation = n.merchant_presentations;
    if (!isActionableQueueCallNotification({
      presentationId: n.presentation_id,
      expiresAt: n.expires_at,
      presentationStatus: presentation?.status ?? null,
      redemptionStatus: presentation?.redemptions?.status ?? null,
    })) continue;
    items.push({
      title: n.title,
      body: n.message,
      at: n.created_at,
      unread: !n.is_read,
      expiresAt: n.expires_at ?? presentation?.expires_at ?? null,
    });
  }

  // D215/D216 — these two reads are the shopper's OWN commitments, not
  // discovery, so they carry the demo exclusion but NOT the discovery
  // visibility policy. The question here is redeemability, not visibility, and
  // the two do not coincide:
  //
  //   - `verify_redemption` itself has no merchant status check, so the RPC is
  //     not the gate;
  //   - `requireMerchant("can_verify")` returns 403 for suspended / rejected /
  //     churned BEFORE the RPC, so those tickets cannot be redeemed through the
  //     product and an expiry deadline on them is a false urgency;
  //   - a merely hidden (`is_visible = false`) or shadow-banned merchant CAN
  //     still verify, so those tickets stay live and keep their notice. Gating
  //     on the discovery policy would strip the deadline from a redeemable
  //     ticket, and `status = 'active'` would also wrongly exclude `pending`.
  //
  // So this excludes exactly the statuses that block verification, derived from
  // the same constant `requireMerchant` enforces rather than restated here.
  const { data: pending } = await withoutDemo(
    service
      .from("redemptions")
      .select("expires_at, merchants!inner(merchant_name)")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .not(
        "merchants.status",
        "in",
        `(${VERIFICATION_BLOCKING_MERCHANT_STATUSES.join(",")})`
      )
      // D213 criterion 3 — the upper bound is NOT applied here. "Expires soon"
      // is a WINDOW, and a window has two edges: a claim with three hours left
      // when the page opened enters it an hour later, and a server-side `.lt`
      // would have excluded it from the payload entirely, so no amount of
      // client filtering could admit it. Both edges are applied on the shared
      // clock instead. This is not a wider fetch for its own sake: it is the
      // same live pending set, bounded by the shopper's own claims.
      .gt("expires_at", new Date().toISOString()),
    includeDemo
  );
  for (const r of (pending ?? []) as unknown as {
    expires_at: string;
    merchants: { merchant_name: string } | null;
  }[]) {
    items.push({
      title: r.merchants?.merchant_name ?? "Maanta",
      body: "Your claimed code expires soon",
      // The moment the reminder becomes TRUE, not the moment the page happened
      // to render. A row admitted an hour after load would otherwise appear
      // already "1h" old, while opening the page at that same instant shows it
      // as "now" — the aged page and a reload disagreeing about the same row.
      at: new Date(new Date(r.expires_at).getTime() - 2 * 3600_000).toISOString(),
      unread: true,
      // Carried, not discarded: without it the reminder says a dead code
      // expires soon, indefinitely.
      expiresAt: r.expires_at,
      // ...and the near edge, so the row appears when the claim enters the
      // window rather than only when the page is reloaded inside it.
      visibleFrom: new Date(
        new Date(r.expires_at).getTime() - 2 * 3600_000
      ).toISOString(),
    });
  }

  const { data: flagged } = await withoutDemo(
    service
      .from("redemptions")
      .select("redeemed_at, merchants!inner(merchant_name)")
      .eq("user_id", user.id)
      .eq("status", "flagged"),
    includeDemo
  )
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
    // D25/D119/D214 — a paused deal leaves shopper discovery immediately, and
    // this inbox is a discovery surface: it says "New deal from a saved shop".
    // Like `/search` and `shops/[id]`, this page selects from `deals` directly
    // rather than reading `getLiveDeals`, so it must carry the predicate itself.
    // Without it, a merchant who posts and then pauses within 24h keeps being
    // advertised here.
    // D215/D216 — this one IS a discovery surface: it pushes "New deal from a
    // saved shop" at a shopper. So it carries the full canonical policy, via
    // the shared helper rather than three hand-written conditions, with
    // `includeDemo` threaded so demo mode stays explicit in BOTH directions:
    // ON keeps these notifications working (the marketplace doubles as a sales
    // demonstration), OFF excludes synthetic deals and merchants.
    //
    // The two must land together: adopting `withPublicMerchant` without
    // threading `includeDemo` would default to excluding demo rows and break
    // demo mode — closing D215 by introducing D216's inverse.
    const { data: newDeals } = await withPublicMerchant(
      service
        .from("deals")
        .select("created_at, deal_type, merchants!inner(merchant_name)")
        .in("merchant_id", favIds)
        .eq("is_active", true)
        .eq("is_paused", false)
        .gt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
      { includeDemo }
    )
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
        // The event itself stays true forever, but this alert is scoped to the
        // last 24 hours by its own query — so an open page must drop it at the
        // same boundary a fresh render would, or the two disagree.
        expiresAt: new Date(
          new Date(d.created_at).getTime() + 24 * 3600_000
        ).toISOString(),
      });
    }
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <Page className="px-0 pt-4">
      <div className="px-4">
        <BackToYouLink />
        <HeadingLg className="mt-4">Notifications</HeadingLg>
        <Body className="mt-1">Deal alerts and code reminders.</Body>
        <p className="mt-2 text-sm">
          <Link
            href="/you/notifications"
            className="font-semibold text-ink underline-offset-2 hover:underline"
          >
            Manage alert preferences
          </Link>
        </p>
      </div>

      <Section title="Alerts" className="mt-6">
        <NotificationList items={items} />
      </Section>
    </Page>
  );
}
