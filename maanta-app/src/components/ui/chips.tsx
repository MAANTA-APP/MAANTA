"use client";

import { useEffect, useState } from "react";
import { cn, timeLeftLabel, isNearExpiry } from "@/lib/ui";
import { IconLock } from "@/components/ui/icons";

/**
 * 2a Flash / Boost tags — outline pills only. Amber is rationed to the one
 * action per screen + R1–R4 (brief L5/L7), so a BOOSTED chip is never an
 * amber fill; and warnings are never red/yellow, so FLASH carries no colour.
 */
export function FlashTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border-[1.5px] border-ink bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink",
        className
      )}
    >
      Flash
    </span>
  );
}

export function BoostedTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border-[1.5px] border-ink bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink",
        className
      )}
    >
      Boosted
    </span>
  );
}

/** 2b + 2f Status chips */
const STATUS_STYLES: Record<string, string> = {
  active: "bg-ink text-white",
  live: "bg-ink text-white",
  expired: "bg-cream-dark text-muted",
  ended: "bg-cream-dark text-muted",
  pending: "bg-white text-muted border border-line",
  draft: "bg-white text-muted border border-line",
  paused: "bg-cream-dark text-muted",
  archived: "bg-cream-dark text-muted",
  converted: "bg-brand text-ink",
  flagged: "bg-white text-flame border border-flame",
  selected: "bg-brand text-ink",
  owner: "bg-ink text-white",
  current: "bg-brand text-ink",
};

export function StatusChip({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize",
        STATUS_STYLES[status.toLowerCase()] ?? "bg-cream-dark text-muted",
        className
      )}
    >
      {label ?? status}
    </span>
  );
}

/**
 * Shopper claim-state chip — frozen S4/S5/S6 StatusChip: an outline pill that
 * carries an icon + WORD so the state survives greyscale (L12). Amber-free.
 */
type ClaimState = "claimed" | "active" | "redeemed" | "expired" | "limit";
const CLAIM_CHIP: Record<ClaimState, { icon: string; label: string; strong: boolean }> = {
  claimed: { icon: "✓", label: "CLAIMED", strong: true },
  active: { icon: "●", label: "ACTIVE", strong: true },
  redeemed: { icon: "✓", label: "REDEEMED", strong: true },
  expired: { icon: "○", label: "EXPIRED", strong: false },
  limit: { icon: "●", label: "LIMIT REACHED", strong: false },
};

export function ClaimChip({
  state,
  label,
  className,
}: {
  state: ClaimState;
  label?: string;
  className?: string;
}) {
  const c = CLAIM_CHIP[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-[1.5px] bg-white px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em]",
        c.strong ? "border-ink text-ink" : "border-muted text-secondary",
        className
      )}
    >
      <span aria-hidden className="text-[10px]">
        {c.icon}
      </span>
      {label ?? c.label}
    </span>
  );
}

/** 2f "Locked 36h" chip (agent leads) */
export function LockedChip({ hoursLeft }: { hoursLeft: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-white">
      <IconLock className="h-3 w-3" />
      Locked {hoursLeft}h
    </span>
  );
}

/** ● LIVE chip (node cards) — outline pill + filled dot + word (L12), no amber fill. */
export function LiveChip({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-white px-2.5 py-0.5 text-[11px] font-bold tracking-[0.06em] text-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-ink" />
      {label}
    </span>
  );
}

export function ComingSoonChip({ label = "Coming soon" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-cream px-2.5 py-0.5 text-[11px] font-semibold text-muted">
      {label}
    </span>
  );
}

/** 2d Plan chips */
export function PlanChip({
  plan,
  className,
}: {
  plan: "standard" | "elite";
  className?: string;
}) {
  return plan === "elite" ? (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold text-brand",
        className
      )}
    >
      Elite
    </span>
  ) : (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-ink bg-white px-2.5 py-0.5 text-[11px] font-semibold text-ink",
        className
      )}
    >
      Standard
    </span>
  );
}

/** 2c Countdown chip — ticks every 30s; goes flame-red near expiry. */
export function CountdownChip({
  expiresAt,
  className,
  suffix,
}: {
  expiresAt: string | null;
  className?: string;
  suffix?: string;
}) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!expiresAt) return null;
  const label = timeLeftLabel(expiresAt);
  const near = isNearExpiry(expiresAt);
  const ended = label === "Ended";
  return (
    <span
      className={cn(
        "tnum inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        // Urgency is rust, never yellow or red (L6). Ended is neutral grey.
        ended
          ? "bg-cream-dark text-faint"
          : near
            ? "border border-rust bg-white text-rust"
            : "bg-cream text-secondary",
        className
      )}
    >
      {label}
      {suffix && !ended ? <span className="ml-1">{suffix}</span> : null}
    </span>
  );
}

/** 2e what3words address chip — always links to what3words maps, monospace. */
export function W3wChip({
  address,
  className,
  linked = true,
}: {
  address: string;
  className?: string;
  linked?: boolean;
}) {
  const clean = address.replace(/^\/+/, "");
  const inner = (
    <>
      <span className="text-secondary">{"///"}</span>
      {clean}
      {linked ? <span aria-hidden> ↗</span> : null}
    </>
  );
  const cls = cn(
    "inline-flex items-center rounded-md bg-cream px-2 py-0.5 font-mono text-xs text-ink underline-offset-2",
    linked && "underline decoration-line hover:bg-cream-dark",
    className
  );
  if (!linked) return <span className={cls}>{inner}</span>;
  return (
    <a
      href={`https://what3words.com/${clean}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cls}
      onClick={(e) => e.stopPropagation()}
    >
      {inner}
    </a>
  );
}

/** Fraud reason chip (1j / 11d): Geofence / Velocity / Collusion */
export function FraudChip({ reason }: { reason: string }) {
  const styles: Record<string, string> = {
    geofence: "bg-flame text-white",
    velocity: "bg-brand text-ink",
    collusion: "bg-ink text-white",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize",
        styles[reason.toLowerCase()] ?? "bg-cream-dark text-muted"
      )}
    >
      {reason}
    </span>
  );
}
