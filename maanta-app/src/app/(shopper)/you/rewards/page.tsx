import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/data";
import { getRewardBalance, listRewardEvents } from "@/lib/fast-visit";
import {
  FAST_VISIT_WINDOW_MINUTES,
  formatArrivalDuration,
} from "@/lib/fast-visit-window";
import { relativeAgo } from "@/lib/ui";
import {
  BackToYouLink,
  Body,
  HeadingLg,
  Meta,
  Page,
  Section,
} from "@/components/ui/claude";

export const dynamic = "force-dynamic";

/**
 * Rewards — where MAANTA Points live. Deliberately small (founder brief
 * 2026-08-26 §15): a balance, recent activity, and nothing else. No tiers, no
 * marketplace, no cash redemption. Points are promotional loyalty rewards —
 * never rendered as currency or with money styling; the frozen money rules
 * apply to money, and this is not money, which the page says out loud so a
 * shopper never mistakes it.
 */
export default async function RewardsPage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/you/rewards");

  const [balance, events] = await Promise.all([
    getRewardBalance(user.id),
    listRewardEvents(user.id),
  ]);

  return (
    <Page className="px-0 pt-4">
      <div className="px-4">
        <BackToYouLink />
        <HeadingLg className="mt-4">Rewards</HeadingLg>
        <Body className="mt-1">
          Earn points by reaching the shop within {FAST_VISIT_WINDOW_MINUTES}{" "}
          minutes of claiming.
        </Body>
      </div>

      <Section className="mt-6">
        {balance === null ? (
          <div className="rounded-card bg-white px-4 py-5 text-sm text-muted shadow-card">
            Couldn&apos;t load your points right now — this is a read error, not
            an empty balance. Pull to refresh or try again shortly.
          </div>
        ) : (
          <div className="rounded-card bg-white px-4 py-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              MAANTA Points
            </p>
            <p className="tnum mt-1 text-3xl font-bold text-ink">{balance}</p>
            <Meta as="p" className="mt-2">
              Points are promotional rewards. They have no cash value.
            </Meta>
          </div>
        )}
      </Section>

      <Section title="Recent activity" className="mt-6">
        {events === null ? (
          <div className="rounded-card bg-white px-4 py-5 text-sm text-muted shadow-card">
            Couldn&apos;t load your activity right now.
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-white px-4 py-5 text-sm text-muted">
            No rewards yet. Claim a deal, scan the MAANTA QR at the shop within{" "}
            {FAST_VISIT_WINDOW_MINUTES} minutes, and have staff verify your
            code.
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((e) => {
              const claimed = e.redemptions?.claimed_at ?? null;
              const arrived = e.redemptions?.arrived_at ?? null;
              return (
                <div
                  key={e.id}
                  className="flex items-start justify-between rounded-card bg-white px-4 py-3.5 shadow-card"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Fast Visit reward
                    </p>
                    <p className="mt-0.5 text-xs text-secondary">
                      {e.merchants?.merchant_name ?? "Shop"}
                      {claimed && arrived
                        ? ` · Arrived in ${formatArrivalDuration(claimed, arrived)}`
                        : ""}
                    </p>
                    <Meta as="p" className="mt-0.5">
                      {relativeAgo(e.awarded_at)}
                    </Meta>
                  </div>
                  <span className="tnum shrink-0 text-sm font-bold text-ink">
                    +{e.points}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </Page>
  );
}
