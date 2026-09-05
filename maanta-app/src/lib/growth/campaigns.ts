import { publicOrigin } from "@/lib/app-url";
import { SITEMAP_ROUTES } from "@/lib/marketing/nav";

/**
 * Campaigns and the tracked-link builder behind `/admin/growth/campaigns`.
 *
 * The builder exists because a hand-typed UTM is how attribution dies: one
 * `utm_source=Instagram` beside twenty `instagram` splits a campaign into two
 * rows that never add up, and nothing in the data says which is which. So the
 * source/medium pairs are a closed list, the destination is picked from the
 * routes that actually exist, and `buildTrackedLink` is the only way a campaign
 * gets a URL.
 *
 * **Spend is internal.** `costPerSignup` is a private operating figure. It never
 * renders on a public page, in a deck, or beside anything that could be read as
 * traction — cost per signup with a signup count next to it is a traction claim
 * whatever the label says.
 */

export const CAMPAIGN_CHANNELS = [
  "instagram",
  "tiktok",
  "whatsapp",
  "facebook",
  "linkedin",
  "offline",
  "email",
] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CAMPAIGN_CHANNEL_LABELS: Record<CampaignChannel, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  offline: "Offline",
  email: "Email",
};

/**
 * The medium each channel posts under. Fixed per channel rather than free
 * choice: `utm_medium` only earns its place if it partitions channels the same
 * way every time.
 */
export const CAMPAIGN_CHANNEL_MEDIUM: Record<CampaignChannel, string> = {
  instagram: "social",
  tiktok: "social",
  whatsapp: "referral",
  facebook: "social",
  linkedin: "social",
  offline: "offline",
  email: "email",
};

export function isCampaignChannel(value: unknown): value is CampaignChannel {
  return typeof value === "string" && (CAMPAIGN_CHANNELS as readonly string[]).includes(value);
}

export const CAMPAIGN_STATUSES = ["draft", "running", "paused", "ended"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

export type Campaign = {
  id: string;
  name: string;
  /** `utm_campaign`. Slug-shaped and unique — this is the attribution join key. */
  slug: string;
  channel: CampaignChannel;
  destination: string;
  status: CampaignStatus;
  /** Internal only. Null when nothing was spent (an organic or owned channel). */
  spendKes: number | null;
  isTest: boolean;
  createdAt: string;
};

/**
 * Destinations a campaign may point at: the indexable marketing routes, and only
 * those. `lib/marketing/nav.ts` already states the site's link hygiene rule — no
 * entry may point at `#` or a "coming soon" page — and reading the destination
 * list from `SITEMAP_ROUTES` makes a campaign incapable of advertising a route
 * that does not exist.
 */
export const CAMPAIGN_DESTINATIONS: readonly string[] = SITEMAP_ROUTES.map((r) => r.path);

/**
 * Normalize a campaign name into a `utm_campaign` slug. Lowercase, hyphenated,
 * ASCII — the same string has to survive a QR poster, a WhatsApp forward and a
 * spreadsheet without changing case or picking up an accent.
 */
export function toCampaignSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type TrackedLinkInput = {
  destination: string;
  channel: CampaignChannel;
  slug: string;
};

/**
 * The one way a campaign link is made.
 *
 * Throws on an unknown destination rather than building a URL to a 404: a dead
 * campaign link is spend converted directly into nothing, and it is discovered
 * by a shopper rather than by us.
 */
export function buildTrackedLink(input: TrackedLinkInput, origin = publicOrigin()): string {
  if (!CAMPAIGN_DESTINATIONS.includes(input.destination)) {
    throw new Error(`Unknown campaign destination: ${input.destination}`);
  }
  const url = new URL(`${origin}${input.destination === "/" ? "" : input.destination}`);
  url.searchParams.set("utm_source", input.channel);
  url.searchParams.set("utm_medium", CAMPAIGN_CHANNEL_MEDIUM[input.channel]);
  url.searchParams.set("utm_campaign", input.slug);
  return url.toString();
}

/**
 * KES per signup, or null when there is nothing honest to divide.
 *
 * Null for zero signups rather than Infinity or a dash-shaped zero: "we spent
 * money and got nobody" is a real and important reading, and it is not a cost
 * per signup. Null for null spend for the same reason — an owned channel has no
 * cost per signup, it has no cost.
 */
export function costPerSignup(spendKes: number | null, signups: number): number | null {
  if (spendKes === null || spendKes <= 0) return null;
  if (signups <= 0) return null;
  return Math.round(spendKes / signups);
}

/** Join campaigns to the signup counts attribution actually produced. */
export function withSignupCounts(
  campaigns: Campaign[],
  signupsBySlug: Map<string, number>
): (Campaign & { signups: number; costPerSignup: number | null })[] {
  return campaigns.map((c) => {
    const signups = signupsBySlug.get(c.slug) ?? 0;
    return { ...c, signups, costPerSignup: costPerSignup(c.spendKes, signups) };
  });
}

/** Map a database row onto the domain type. */
export function rowToCampaign(row: Record<string, unknown>): Campaign {
  const channel = row.channel;
  const status = row.status;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    channel: isCampaignChannel(channel) ? channel : "offline",
    destination: String(row.destination ?? "/"),
    status: isCampaignStatus(status) ? status : "draft",
    spendKes: row.spend_kes === null || row.spend_kes === undefined ? null : Number(row.spend_kes),
    isTest: Boolean(row.is_test),
    createdAt: String(row.created_at),
  };
}
