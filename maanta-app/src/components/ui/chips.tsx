"use client";

import { useEffect, useState } from "react";
import { cn, timeLeftLabel, isNearExpiry } from "@/lib/ui";
import { IconBolt, IconLock } from "@/components/ui/icons";

/** 2a Flash / Boost tags */
export function FlashTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-flame px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white",
        className
      )}
    >
      <IconBolt className="h-3 w-3" />
      Flash
    </span>
  );
}

export function BoostedTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink",
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

/** 2f "Locked 36h" chip (agent leads) */
export function LockedChip({ hoursLeft }: { hoursLeft: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-white">
      <IconLock className="h-3 w-3" />
      Locked {hoursLeft}h
    </span>
  );
}

/** ● LIVE chip (node cards) */
export function LiveChip({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-verified" />
      {label}
    </span>
  );
}

export function ComingSoonChip({ label = "Coming soon" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-cream-dark px-2.5 py-0.5 text-[11px] font-semibold text-muted">
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
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        ended
          ? "bg-cream-dark text-muted"
          : near
            ? "bg-flame text-white"
            : "bg-cream text-ink",
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
      <span className="text-flame">{"///"}</span>
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
