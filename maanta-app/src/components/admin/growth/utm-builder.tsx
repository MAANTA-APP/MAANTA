"use client";

import { useMemo, useState } from "react";
import {
  buildTrackedLink,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_CHANNEL_MEDIUM,
  toCampaignSlug,
  type CampaignChannel,
} from "@/lib/growth/campaigns";

/**
 * The tracked-link builder — the only way a campaign gets a URL.
 *
 * A hand-typed UTM is how attribution dies quietly: one `utm_source=Instagram`
 * beside twenty `instagram` splits a campaign into two rows that never add up,
 * and nothing in the data afterwards says which was which. So the source is a
 * closed list, the medium follows from it, the campaign is slugged as you type,
 * and the destination comes from the routes that actually exist — a builder
 * cannot produce a link to a page MAANTA does not serve.
 */
export function UtmBuilder({
  destinations,
  origin,
}: {
  destinations: readonly string[];
  /** Passed in from the server so the preview matches the real public origin. */
  origin: string;
}) {
  const [destination, setDestination] = useState(destinations[0] ?? "/");
  const [channel, setChannel] = useState<CampaignChannel>("instagram");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);

  const slug = toCampaignSlug(name);
  const link = useMemo(() => {
    if (!slug) return null;
    try {
      return buildTrackedLink({ destination, channel, slug }, origin);
    } catch {
      return null;
    }
  }, [destination, channel, slug, origin]);

  const field =
    "h-10 w-full rounded-lg border border-ink bg-white px-3 font-mono text-[13px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="utm-destination" className="mb-1.5 block text-[11px] font-medium text-muted">
          Destination
        </label>
        <select
          id="utm-destination"
          className={field}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        >
          {destinations.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="utm-channel" className="mb-1.5 block text-[11px] font-medium text-muted">
          Source · medium
        </label>
        <select
          id="utm-channel"
          className={field}
          value={channel}
          onChange={(e) => setChannel(e.target.value as CampaignChannel)}
        >
          {CAMPAIGN_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c} · {CAMPAIGN_CHANNEL_MEDIUM[c]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="utm-campaign" className="mb-1.5 block text-[11px] font-medium text-muted">
          Campaign
        </label>
        <input
          id="utm-campaign"
          className={field}
          value={name}
          placeholder="Node 0 teaser"
          onChange={(e) => {
            setName(e.target.value);
            setCopied(false);
          }}
        />
        {name && slug !== name.toLowerCase() ? (
          <p className="mt-1.5 font-mono text-[11px] text-muted">
            utm_campaign=<span className="text-ink">{slug || "…"}</span>
          </p>
        ) : null}
      </div>

      <div className="rounded-lg bg-stone p-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          Result
        </p>
        <p className="mt-1.5 break-all font-mono text-[11px] font-medium leading-relaxed text-ink">
          {link ?? (
            <span className="text-muted">Name the campaign to build its link.</span>
          )}
        </p>
      </div>

      <button
        type="button"
        disabled={!link}
        onClick={async () => {
          if (!link) return;
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          } catch {
            // A blocked clipboard is not an error worth a banner — the link is
            // on screen and selectable, which is the fallback either way.
            setCopied(false);
          }
        }}
        className="flex h-10 items-center justify-center rounded-pill bg-ink text-[13px] font-semibold text-white hover:bg-ink-900 disabled:bg-cream-dark disabled:text-faint"
      >
        {copied ? "Copied" : "Copy link"}
      </button>

      <p className="text-[11px] leading-relaxed text-faint">
        Paste this into the post, the bio or the QR poster. The campaign row below
        counts signups by matching this <code className="font-mono">utm_campaign</code>.
      </p>
    </div>
  );
}
