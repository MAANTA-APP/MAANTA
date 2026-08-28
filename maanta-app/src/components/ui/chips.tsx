"use client";

import { cn, isNearExpiry } from "@/lib/ui";
import { getDealExpiryState } from "@/lib/deal-expiry";
import { useShopperClock } from "@/lib/use-shopper-clock";
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

/** 2c Countdown chip — deal expiry + 15-minute grace; ticks every 30s. */
type CountdownChipProps = {
  expiresAt: string | null;
  className?: string;
};

/**
 * D213 criterion 3 — a caller rendering other time-derived elements beside
 * this chip passes its own clock instant, so the two provably read the SAME
 * `Date` and cannot disagree.
 *
 * The controlled and self-ticking paths are SEPARATE components on purpose: a
 * single component calling `useShopperClock()` unconditionally would start an
 * interval for every controlled chip too, waking and re-rendering it every 30s
 * on a timestamp it ignores. A feed of cards would then accumulate dozens of
 * redundant timers while claiming to share one.
 */
export function CountdownChip({
  now,
  ...props
}: CountdownChipProps & { now?: Date }) {
  if (now) return <CountdownChipView {...props} now={now} />;
  return <SelfTickingCountdownChip {...props} />;
}

function SelfTickingCountdownChip(props: CountdownChipProps) {
  const now = useShopperClock();
  return <CountdownChipView {...props} now={now} />;
}

function CountdownChipView({
  expiresAt,
  className,
  now,
}: CountdownChipProps & { now: Date }) {
  const at = now;
  if (!expiresAt) return null;
  const { status, displayText } = getDealExpiryState(expiresAt, at);
  if (!displayText) return null;
  const near = status === "live" && isNearExpiry(expiresAt, at);
  const urgent = status === "in_grace" || near;
  return (
    <span
      suppressHydrationWarning
      className={cn(
        "tnum inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        status === "expired"
          ? "bg-cream-dark text-faint"
          : urgent
            ? "border border-rust bg-white text-rust"
            : "bg-cream text-secondary",
        className
      )}
    >
      {displayText}
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

/**
 * Guardian v1 recommendation chip (docs/maanta-guardian-v1.md). Icon + WORD so
 * the state survives greyscale (L12). Amber-free; red is confined to the held
 * chip's border and the blocked chip's fill (frozen colour rules). "flag" uses
 * rust — attention, not alarm (L6).
 */
type GuardianRec = "clear" | "flag" | "soft_block" | "hard_block";
const GUARDIAN_CHIP: Record<GuardianRec, { icon: string; label: string; cls: string }> = {
  clear: { icon: "✓", label: "Clear", cls: "border border-line bg-white text-secondary" },
  flag: { icon: "!", label: "Flagged", cls: "border border-rust bg-white text-rust" },
  soft_block: { icon: "◑", label: "Held", cls: "border border-flame bg-white text-flame" },
  hard_block: { icon: "✕", label: "Blocked", cls: "bg-flame text-white" },
};

export function GuardianChip({
  recommendation,
  className,
}: {
  recommendation: string;
  className?: string;
}) {
  const c = GUARDIAN_CHIP[recommendation as GuardianRec];
  if (!c) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-line bg-cream px-2.5 py-0.5 text-[11px] font-semibold text-muted",
          className
        )}
      >
        No Guardian read
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-[0.04em]",
        c.cls,
        className
      )}
    >
      <span aria-hidden className="text-[10px]">
        {c.icon}
      </span>
      {c.label}
    </span>
  );
}

/** Guardian check severity chip (info / warn / block) — greyscale-readable. */
export function GuardianSeverityChip({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    info: "border border-line bg-white text-secondary",
    warn: "border border-rust bg-white text-rust",
    block: "border border-flame bg-white text-flame",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]",
        styles[severity.toLowerCase()] ?? "border border-line bg-cream text-muted"
      )}
    >
      {severity}
    </span>
  );
}

/** Fraud reason chip (1j / 11d): Geofence / Velocity / Collusion */
export function FraudChip({ reason, className }: { reason: string; className?: string }) {
  // A9 — fraud reasons are error-severity, so the token intent is text+border
  // (matching the flagged StatusChip / InlineAlert error tone), never a solid
  // fill and never amber. The reason word itself carries the distinction.
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border-[1.5px] border-flame bg-white px-2.5 py-0.5 text-[11px] font-bold capitalize text-flame",
        className
      )}
    >
      {reason}
    </span>
  );
}
